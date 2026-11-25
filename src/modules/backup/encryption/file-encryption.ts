import { createCipheriv, randomBytes } from "node:crypto";
import { open, stat, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BackupData } from "../registry/types";
import { serializeBackup } from "./serialization";
import { deriveBackupKey } from "./streams";
/** Legacy-compatible encrypted file output with fixed stream buffers. */
export async function encryptBackupFile(data: BackupData, password: string, path: string) {
  if (!password || password.length < 8) throw new Error("Encryption password must be at least 8 characters");
  const salt = randomBytes(32), iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", deriveBackupKey(password, salt), iv);
  const file = await open(path, "wx", 0o600);
  try { await file.write(Buffer.concat([salt, iv, Buffer.alloc(16)]), 0, 64, 0); } finally { await file.close(); }
  try {
  await pipeline(Readable.from(serializeBackup(data, "tagged")), createGzip(), cipher, createWriteStream(path, { flags: "r+", start: 64 }));
  const header = await open(path, "r+");
  try { await header.write(cipher.getAuthTag(), 0, 16, 48); } finally { await header.close(); }
  return (await stat(path)).size;
  } catch (error) { await unlink(path).catch(() => {}); throw error; }
}
