/**
 * AES-256-GCM + scrypt. Wire format remains [salt:32][iv:16][tag:16][ciphertext].
 * Gzip and JSON are streamed; legacy uncompressed backups remain readable.
 * Dataset objects and encrypted storage bytes still need to fit server memory.
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { createGzip } from "node:zlib";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getHeapStatistics } from "node:v8";
import { JSONParser } from "@streamparser/json";
import type { BackupData } from "../registry/types";
import { BackupCapacityError, serializeBackup } from "./serialization";
import { BackupAuthenticationError, decodeBackupInto, deriveBackupKey } from "./streams";

const HEADER_LENGTH = 64;
const CHUNK_BYTES = 64 * 1024;
const CAPACITY_MESSAGE = "This in-memory backup API reached its restore memory budget. Use the file upload restore to process it in bounded chunks. No restore data has been replaced.";

/** Compress directly from rows, without retaining all serialized JSON bytes. */
export async function encryptBackup(data: BackupData, password: string): Promise<Buffer> {
  if (!password || password.length < 8) throw new Error("Encryption password must be at least 8 characters");
  const salt = randomBytes(32), iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", deriveBackupKey(password, salt), iv);
  const chunks: Buffer[] = [];
  let bytes = HEADER_LENGTH;
  const collect = new Writable({
    write(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > getHeapStatistics().heap_size_limit / 2 || (process.availableMemory && process.availableMemory() < 64 * 1024 * 1024)) {
        done(new BackupCapacityError("The in-memory backup API reached its memory budget. Use file-based backup creation for larger datasets."));
        return;
      }
      chunks.push(chunk);
      done();
    },
  });
  await pipeline(Readable.from(serializeBackup(data, "tagged")), createGzip(), cipher, collect);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), ...chunks]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBackup(value: unknown): value is BackupData {
  return isObject(value) && isObject(value.manifest) && isObject(value.data)
    && typeof value.manifest.checksum === "string" && isObject(value.manifest.sources)
    && Object.values(value.data).every(Array.isArray);
}

/**
 * Authenticate before parsing, then stream decrypted JSON into its final objects.
 * The second cipher pass avoids retaining the complete decrypted/gunzipped buffer.
 * Resource rejection happens before callers can enter a restore transaction.
 */
export async function decryptBackup(encryptedData: Buffer, password: string): Promise<BackupData> {
  const heapLimit = getHeapStatistics().heap_size_limit;
  // The restore contract currently materializes the dataset and later clones rows.
  // Leave room for that work instead of pretending streaming makes RAM unlimited.
  const maxBytes = Math.floor(heapLimit / 2);
  let bytes = 0;
  let result: unknown;
  const parser = new JSONParser({ keepStack: true, stringBufferSize: CHUNK_BYTES });
  parser.onValue = ({ value, parent, key }) => {
    if (isObject(value) && typeof value.__bigint === "string") {
      const revived = BigInt(value.__bigint);
      if (parent !== undefined && key !== undefined) {
        (parent as unknown as Record<string | number, unknown>)[key] = revived;
      } else result = revived;
    } else if (parent === undefined) result = value;
  };
  try {
    const decode = new Writable({
      write(chunk: Buffer, _encoding, done) {
        try {
          bytes += chunk.length;
          if (bytes > maxBytes || process.memoryUsage().heapUsed > heapLimit * 0.8
            || (process.availableMemory && process.availableMemory() < 64 * 1024 * 1024)) {
            throw new BackupCapacityError(CAPACITY_MESSAGE);
          }
          parser.write(chunk);
          done();
        } catch (error) { done(error as Error); }
      },
      final(done) {
        try { if (!parser.isEnded) parser.end(); done(); }
        catch (error) { done(error as Error); }
      },
    });
    await decodeBackupInto(encryptedData, password, decode);
    if (!isBackup(result)) throw new Error("Missing backup manifest or source arrays");
    return result;
  } catch (error) {
    if (error instanceof BackupCapacityError || error instanceof BackupAuthenticationError || (error instanceof Error && error.message.includes("data too short"))) throw error;
    if (error instanceof RangeError) throw new BackupCapacityError(CAPACITY_MESSAGE);
    throw new Error("Decryption failed: invalid backup data format. The authenticated file contains damaged compression or incomplete/invalid JSON; obtain a fresh backup.");
  }
}

export function isEncryptedBackup(data: Buffer): boolean {
  return data.length > HEADER_LENGTH;
}
