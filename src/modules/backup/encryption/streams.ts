import { createDecipheriv, scryptSync } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
export class BackupAuthenticationError extends Error {
  constructor() { super("Decryption failed: wrong password or corrupted data"); }
}
export function deriveBackupKey(password: string, salt: Buffer) { return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }); }
function* chunks(buffer: Buffer) { for (let offset = 64; offset < buffer.length; offset += 65536) yield buffer.subarray(offset, offset + 65536); }
/** Authenticate in a bounded first pass, then decrypt/decompress into a bounded sink. */
export async function decodeBackupInto(input: Buffer | string, password: string, output: Writable) {
  const size = typeof input === "string" ? (await stat(input)).size : input.length;
  if (size <= 64) throw new Error("Invalid backup file: data too short");
  let header: Buffer;
  if (typeof input === "string") { const file = await open(input, "r"); try { header = Buffer.alloc(64); await file.read(header, 0, 64, 0); } finally { await file.close(); } }
  else header = input.subarray(0, 64);
  const key = deriveBackupKey(password, header.subarray(0, 32));
  const source = () => typeof input === "string" ? createReadStream(input, { start: 64, highWaterMark: 65536 }) : Readable.from(chunks(input));
  const decipher = () => { const result = createDecipheriv("aes-256-gcm", key, header.subarray(32, 48)); result.setAuthTag(header.subarray(48, 64)); return result; };
  let compressed = false, first = true;
  try {
    await pipeline(source(), decipher(), new Writable({ write(chunk: Buffer, _encoding, done) {
      if (first) compressed = chunk[0] === 0x1f && chunk[1] === 0x8b;
      first = false; done();
    } }));
  } catch { throw new BackupAuthenticationError(); }
  if (compressed) await pipeline(source(), decipher(), createGunzip(), output);
  else await pipeline(source(), decipher(), output);
}
