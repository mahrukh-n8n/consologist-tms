/** Private, temporary row spool. Payloads and identity indexes live on disk;
 * callers retain array-compatible access without retaining the dataset in RAM. */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, chmodSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { BackupId, BackupIdMaps } from "../registry/types";
import { BackupCapacityError } from "../encryption/serialization";

export const MAX_RECORD_BYTES = 32 * 1024 * 1024;
export const BATCH_BYTES = 4 * 1024 * 1024;
export const BATCH_ROWS = 256;
const attached = new WeakMap<unknown[], { store: DiskDataset; source: string }>();
export function stringifyRow(value: unknown): string {
  const json = JSON.stringify(value, (_key, item) => typeof item === "bigint" ? { __bigint: item.toString() } : item);
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) throw new BackupCapacityError("A backup record exceeds the 32 MB per-record limit. Split that record before retrying; the restore has not committed.");
  return json;
}
export function parseRow(json: string): unknown {
  return JSON.parse(json, (_key, value) => value && typeof value === "object" && typeof value.__bigint === "string" ? BigInt(value.__bigint) : value);
}
const idKey = (id: unknown) => `${typeof id}:${String(id)}`;
const identity = (value: unknown) => value && typeof value === "object" ? (value as { id?: BackupId }).id : undefined;

export class DiskDataset {
  readonly directory: string;
  private db: DatabaseSync;
  private counts = new Map<string, number>();
  private arrays = new Map<string, unknown[]>();
  private writes = 0;
  private closed = false;
  constructor(parent = tmpdir()) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    this.directory = mkdtempSync(join(parent, "backup-spool-")); chmodSync(this.directory, 0o700);
    this.db = new DatabaseSync(join(this.directory, "rows.sqlite"));
    this.db.exec("PRAGMA cache_size=-8192; PRAGMA temp_store=FILE; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE rows(source TEXT, ordinal INTEGER, identity TEXT, json TEXT, bytes INTEGER, PRIMARY KEY(source,ordinal)); CREATE INDEX row_identity ON rows(source,identity,ordinal); CREATE TABLE maps(source TEXT, old TEXT, value TEXT, PRIMARY KEY(source,old)); BEGIN;");
  }
  private checkpoint() { if (++this.writes % 256 === 0) this.db.exec("COMMIT; BEGIN;"); }
  ensure(source: string) { if (!this.counts.has(source)) this.counts.set(source, 0); }
  append(source: string, value: unknown) {
    this.ensure(source); const json = stringifyRow(value), index = this.counts.get(source)!;
    this.db.prepare("INSERT INTO rows VALUES(?,?,?,?,?)").run(source, index, idKey(identity(value)), json, Buffer.byteLength(json));
    this.counts.set(source, index + 1); this.checkpoint();
  }
  get(source: string, index: number): unknown {
    const row = this.db.prepare("SELECT json FROM rows WHERE source=? AND ordinal=?").get(source, index);
    return row ? parseRow(String(row.json)) : undefined;
  }
  set(source: string, index: number, value: unknown) {
    const json = stringifyRow(value);
    this.db.prepare("UPDATE rows SET json=?,bytes=?,identity=? WHERE source=? AND ordinal=?").run(json, Buffer.byteLength(json), idKey(identity(value)), source, index);
    this.checkpoint();
  }
  lookup(source: string, id: unknown) {
    const row = this.db.prepare("SELECT json FROM rows WHERE source=? AND identity=? ORDER BY ordinal LIMIT 1").get(source, idKey(id));
    return row ? parseRow(String(row.json)) : undefined;
  }
  has(source: string, id: unknown) { return !!this.db.prepare("SELECT 1 FROM rows WHERE source=? AND identity=? LIMIT 1").get(source, idKey(id)); }
  firstIndex(source: string, id: unknown) { return Number(this.db.prepare("SELECT ordinal FROM rows WHERE source=? AND identity=? ORDER BY ordinal LIMIT 1").get(source, idKey(id))?.ordinal ?? -1); }
  reset(source: string) { this.db.prepare("DELETE FROM rows WHERE source=?").run(source); this.counts.set(source, 0); }
  rowBytes(source: string, index: number) { return Number(this.db.prepare("SELECT bytes FROM rows WHERE source=? AND ordinal=?").get(source, index)?.bytes ?? 0); }
  array(source: string): unknown[] {
    this.ensure(source);
    const existing = this.arrays.get(source); if (existing) return existing;
    // Methods below are implemented on array/map facades backed by this store.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const store = this;
    const derived = (callback: (value: unknown, index: number, array: unknown[]) => unknown, filter: boolean) => {
      const key = `derived:${randomUUID()}`; store.ensure(key);
      for (let index = 0; index < proxy.length; index++) {
        const value = store.get(source, index), result = callback(value, index, proxy);
        if (!filter || result) store.append(key, filter ? value : result);
      }
      return store.array(key);
    };
    const proxy: unknown[] = new Proxy([] as unknown[], {
      get(target, key, receiver) {
        if (key === "length") return store.counts.get(source)!;
        if (key === Symbol.iterator) return function* () { for (let index = 0; index < proxy.length; index++) yield store.get(source, index); };
        if (key === "map") return (callback: (v: unknown, i: number, a: unknown[]) => unknown) => derived(callback, false);
        if (key === "filter") return (callback: (v: unknown, i: number, a: unknown[]) => unknown) => derived(callback, true);
        if (typeof key === "string" && /^\d+$/.test(key)) return store.get(source, Number(key));
        return Reflect.get(target, key, receiver);
      },
      has(target, key) { return typeof key === "string" && /^\d+$/.test(key) ? Number(key) < proxy.length : Reflect.has(target, key); },
      set(_target, key, value) {
        if (typeof key === "string" && /^\d+$/.test(key) && Number(key) < proxy.length) { store.set(source, Number(key), value); return true; }
        throw new Error("Disk backup rows require explicit append or indexed replacement");
      },
    });
    attached.set(proxy, { store, source }); this.arrays.set(source, proxy); return proxy;
  }
  maps(): BackupIdMaps {
    // Methods below are implemented on array/map facades backed by this store.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const store = this;
    class DiskMap extends Map<BackupId, BackupId> {
      constructor(private source: string) { super(); }
      override set(old: BackupId, value: BackupId) { store.db.prepare("INSERT INTO maps VALUES(?,?,?) ON CONFLICT(source,old) DO UPDATE SET value=excluded.value").run(this.source, idKey(old), JSON.stringify(value)); store.checkpoint(); return this; }
      override get(old: BackupId) { const row = store.db.prepare("SELECT value FROM maps WHERE source=? AND old=?").get(this.source, idKey(old)); return row ? JSON.parse(String(row.value)) as BackupId : undefined; }
      override delete(old: BackupId) { const had = this.has(old); store.db.prepare("DELETE FROM maps WHERE source=? AND old=?").run(this.source, idKey(old)); return had; }
      override clear() { store.db.prepare("DELETE FROM maps WHERE source=?").run(this.source); }
      override forEach(callback: (value: BackupId, key: BackupId, map: Map<BackupId, BackupId>) => void, thisArg?: unknown) { for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this); }
      override has(old: BackupId) { return this.get(old) !== undefined; }
      override get size() { return Number(store.db.prepare("SELECT count(*) AS n FROM maps WHERE source=?").get(this.source)?.n ?? 0); }
      override *entries(): MapIterator<[BackupId, BackupId]> { for (const row of store.db.prepare("SELECT old,value FROM maps WHERE source=? ORDER BY old").iterate(this.source)) { const key = String(row.old); yield [key.startsWith("number:") ? Number(key.slice(7)) : key.slice(7), JSON.parse(String(row.value))]; } }
      override *keys(): MapIterator<BackupId> { for (const [key] of this.entries()) yield key; }
      override *values(): MapIterator<BackupId> { for (const [, value] of this.entries()) yield value; }
      override [Symbol.iterator]() { return this.entries(); }
    }
    return new Proxy({} as BackupIdMaps, { set(target, key, value: Map<BackupId, BackupId>) {
      const map = new DiskMap(String(key)); for (const [old, id] of value) map.set(old, id);
      Reflect.set(target, key, map); return true;
    } });
  }
  dispose() {
    if (this.closed) return; this.closed = true;
    try { this.db.exec("COMMIT;"); } finally { this.db.close(); rmSync(this.directory, { recursive: true, force: true }); }
  }
}
export function diskRows(rows: unknown[]) { return attached.get(rows); }
export function seenIdentities(rows: unknown[]) {
  const disk = diskRows(rows);
  if (!disk) return new Set<unknown>();
  const maps = disk.store.maps(); const key = `seen:${randomUUID()}`; maps[key] = new Map(); const map = maps[key]!;
  return { has: (id: unknown) => map.has(idKey(id)), add: (id: unknown) => { map.set(idKey(id), 1); } };
}
export function lookupRows(rows: unknown[]) {
  const disk = diskRows(rows);
  if (disk) return { get: (id: unknown) => disk.store.lookup(disk.source, id), has: (id: unknown) => disk.store.has(disk.source, id), firstIndex: (id: unknown) => disk.store.firstIndex(disk.source, id) };
  const map = new Map(rows.map(value => [identity(value), value]));
  return { get: (id: unknown) => map.get(id as BackupId), has: (id: unknown) => map.has(id as BackupId), firstIndex: (id: unknown) => rows.findIndex(value => identity(value) === id) };
}
export function* rowBatches(rows: unknown[]): Generator<{ rows: unknown[]; start: number }> {
  const disk = diskRows(rows); let batch: unknown[] = [], bytes = 0, start = 0;
  for (let index = 0; index < rows.length; index++) {
    const size = disk ? disk.store.rowBytes(disk.source, index) : Buffer.byteLength(stringifyRow(rows[index]));
    if (batch.length && (batch.length >= BATCH_ROWS || bytes + size > BATCH_BYTES)) { yield { rows: batch, start }; batch = []; bytes = 0; start = index; }
    batch.push(rows[index]); bytes += size;
  }
  if (batch.length) yield { rows: batch, start };
}
