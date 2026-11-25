import { Tokenizer, TokenParser, TokenType } from "@streamparser/json";
import { Writable } from "node:stream";
import type { BackupData, BackupManifest } from "../registry/types";
import { DiskDataset, MAX_RECORD_BYTES } from "../storage/disk-dataset";
import { BackupCapacityError } from "./serialization";
import { decodeBackupInto } from "./streams";
import { TokenChecksum } from "./token-checksum";
import { markVerifiedArchive } from "./checksum";

/** The archive is authenticated before parsing. Only one row is assembled at a
 * time; completed rows are discarded by the parser and indexed in SQLite. */
export async function openDiskBackup(input: Buffer | string, password: string, parent?: string, omittedFields: Record<string, readonly string[]> = {}, progress?: (bytes: number) => Promise<void>) {
  const store = new DiskDataset(parent);
  const data = Object.create(null) as BackupData["data"];
  let manifest: BackupManifest | undefined;
  let depth = 0, rootKey = "", rootKeyExpected = true, sourceKeyExpected = true, source = "", seenData = false;
  let decodedBytes = 0, reportedBytes = 0;
  let rowBytes = 0, tokenBytes = 0, skipDepth = 0, omitNext = false, rowKeyExpected = true;
  let hashing = false, originalDigest = "";
  const checksum = new TokenChecksum();
  const tokenizer = new Tokenizer({ stringBufferSize: 65536 });
  const parser = new TokenParser({ paths: ["$.manifest", "$.data.*.*"], keepStack: false });
  const validator = new TokenParser({ paths: [], keepStack: false });
  tokenizer.onEnd = () => { if (!parser.isEnded) parser.end(); if (!validator.isEnded) validator.end(); };
  parser.onEnd = () => { if (!tokenizer.isEnded) tokenizer.end(); };
  tokenizer.onToken = info => {
    const { token, value } = info;
    validator.write(info);
    tokenBytes = 0;
    if (depth === 1 && rootKey === "data" && token === TokenType.LEFT_BRACE) {
      if (!manifest) throw new Error("Backup manifest must precede sources");
      checksum.begin(manifest); hashing = true;
    }
    if (hashing) {
      checksum.write(token, value);
      if (depth === 2 && token === TokenType.RIGHT_BRACE) { hashing = false; originalDigest = checksum.end(); }
    }
    const before = depth;
    const suppress = skipDepth > 0;
    let substitute = false;
    if (!suppress && omitNext && [TokenType.LEFT_BRACE, TokenType.LEFT_BRACKET, TokenType.STRING, TokenType.NUMBER, TokenType.TRUE, TokenType.FALSE, TokenType.NULL].includes(token)) {
      substitute = true; omitNext = false;
      if (token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) skipDepth = depth + 1;
    }
    if (!suppress && !substitute && depth === 4 && rowKeyExpected && token === TokenType.STRING) {
      omitNext = omittedFields[source]?.includes(String(value)) ?? false; rowKeyExpected = false;
    }
    if (depth === 3 && token === TokenType.LEFT_BRACE) rowKeyExpected = true;
    if (depth === 4 && token === TokenType.COMMA) rowKeyExpected = true;
    if (token === TokenType.STRING) {
      if (depth === 1 && rootKeyExpected) { rootKey = String(value); rootKeyExpected = false; parser.write(info); return; }
      if (depth === 2 && rootKey === "data" && sourceKeyExpected) { source = String(value); sourceKeyExpected = false; parser.write(info); return; }
    }
    if (token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) {
      if (depth === 0 && token !== TokenType.LEFT_BRACE) throw new Error("Backup root must be an object");
      if (depth === 1 && rootKey === "data") { if (token !== TokenType.LEFT_BRACE || seenData) throw new Error("Invalid backup sources"); seenData = true; sourceKeyExpected = true; }
      if (depth === 2 && rootKey === "data") {
        if (token !== TokenType.LEFT_BRACKET || Object.hasOwn(data, source)) throw new Error("Duplicate or invalid backup source array");
        Object.defineProperty(data, source, { value: store.array(source), enumerable: true, writable: true });
      }
      depth++;
    } else if (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) depth--;
    else if (token === TokenType.COMMA) { if (depth === 1) rootKeyExpected = true; if (depth === 2 && rootKey === "data") sourceKeyExpected = true; }
    else if ([TokenType.STRING, TokenType.NUMBER, TokenType.TRUE, TokenType.FALSE, TokenType.NULL].includes(token) && ((depth === 1 && rootKey === "data") || (depth === 2 && rootKey === "data"))) throw new Error("Invalid backup source value");
    if (suppress && before === skipDepth && (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET)) skipDepth = 0;
    if (substitute) parser.write({ ...info, token: TokenType.NULL, value: null });
    else if (!suppress) parser.write(info);
  };
  parser.onValue = ({ key, value, stack }) => {
    if (key === "manifest" && stack.length === 1) { manifest = value as unknown as BackupManifest; rowBytes = 0; return; }
    if (stack.length !== 3 || stack[1]?.key !== "data" || typeof key !== "number" || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backup record");
    store.append(String(stack[2]!.key), value); rowBytes = 0;
  };
  try {
    await decodeBackupInto(input, password, new Writable({
      write(chunk: Buffer, _encoding, done) {
        try {
          if (!skipDepth) rowBytes += chunk.length;
          tokenBytes += chunk.length;
          if (Math.max(rowBytes, tokenBytes) > MAX_RECORD_BYTES + 65536) throw new BackupCapacityError("A backup record exceeds the 32 MB per-record limit. Split that record before retrying.");
          tokenizer.write(chunk); decodedBytes += chunk.length;
          if (progress && decodedBytes - reportedBytes >= 16 * 1024 * 1024) {
            reportedBytes = decodedBytes; void progress(decodedBytes).then(() => done(), error => done(error as Error));
          } else done();
        } catch (error) { done(error as Error); }
      },
      final(done) { try { if (!tokenizer.isEnded) tokenizer.end(); done(); } catch (error) { done(error as Error); } },
    }));
    if (!manifest || typeof manifest.checksum !== "string" || !manifest.sources || !seenData) throw new Error("Missing backup manifest or data");
    const backup: BackupData = { manifest, data };
    if (originalDigest !== manifest.checksum) throw new Error("Backup integrity check failed: checksum mismatch");
    const archive = { ...backup, store, dispose: () => store.dispose() };
    markVerifiedArchive(archive);
    return archive;
  } catch (error) { store.dispose(); throw error; }
}
