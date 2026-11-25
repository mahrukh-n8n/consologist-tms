import busboy from "busboy";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, statfs } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export class BackupUploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
/** Backpressure reaches the request body. Neither multipart parsing nor file
 * persistence holds the complete encrypted upload in memory. Caller owns cleanup. */
export async function stageBackupUpload(request: Request, parent = join(process.cwd(), "backups", ".restore-work")) {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const disk = await statfs(parent);
  const budget = Math.max(0, Math.floor(disk.bavail * disk.bsize * 0.75) - 256 * 1024 * 1024);
  const capacity = () => new BackupUploadError("Insufficient temporary disk space for this backup upload. Free disk space before retrying; company data has not been replaced.", 413);
  if (Number(request.headers.get("content-length")) > budget) throw capacity();
  const workspace = await mkdtemp(join(parent, "upload-"));
  const path = join(workspace, "upload.enc"), fields: Record<string, string> = Object.create(null);
  let fileSeen = false, bytes = 0;
  try {
    if (!request.body) throw new BackupUploadError("No backup upload received.");
    const parser = busboy({ headers: { "content-type": request.headers.get("content-type") ?? "" }, limits: { files: 1, fields: 8, parts: 9, fieldSize: 16 * 1024, fileSize: budget } });
    const writes: Promise<void>[] = [];
    const reject = (message: string) => parser.destroy(new BackupUploadError(message));
    parser.on("field", (key, value, info) => {
      if (info.valueTruncated || info.nameTruncated || Object.hasOwn(fields, key)) reject("Invalid backup upload fields.");
      else fields[key] = value;
    });
    parser.on("file", (key, file) => {
      if (key !== "file") { file.resume(); reject("Invalid backup upload file."); return; }
      fileSeen = true;
      file.on("limit", () => parser.destroy(capacity()));
      const write = pipeline(file, createWriteStream(path, { flags: "wx", mode: 0o600 }));
      writes.push(write);
      void write.catch(error => parser.destroy(error));
    });
    for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const) parser.on(event, () => reject("Too many backup upload parts."));
    const count = new Transform({ transform(chunk: Buffer, _encoding, done) { bytes += chunk.length; done(bytes > budget ? capacity() : null, chunk); } });
    try { await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream), count, parser); }
    finally { await Promise.all(writes); }
    if (!fileSeen) throw new BackupUploadError("No backup file uploaded.");
    return { fields, path, workspace };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    if (error instanceof BackupUploadError) throw error;
    throw new BackupUploadError("Could not read the backup upload. Select the encrypted backup file and try again.");
  }
}
