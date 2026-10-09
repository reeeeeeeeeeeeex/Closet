import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function dataDirectory() { return path.resolve(process.env.CLOSET_DATA_DIR || path.join(process.cwd(), "data")); }

export class LocalStatement {
  constructor(private database: DatabaseSync, private sql: string, private values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]) { return new LocalStatement(this.database, this.sql, values); }
  async first<T = Record<string, unknown>>(): Promise<T | null> { return (this.database.prepare(this.sql).get(...this.values) as T | undefined) ?? null; }
  rows<T = Record<string, unknown>>(): T[] { return this.database.prepare(this.sql).all(...this.values) as T[]; }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> { return { results: this.database.prepare(this.sql).all(...this.values) as T[] }; }
  // Transactions call this synchronously so requests cannot interleave.
  run() { return this.database.prepare(this.sql).run(...this.values); }
}
export class LocalDatabase {
  private database: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.database = new DatabaseSync(path.join(directory, "closet.sqlite"));
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.database.exec("CREATE TABLE IF NOT EXISTS _closet_migrations (name TEXT PRIMARY KEY);");
    const migrationDir = path.join(process.cwd(), "drizzle");
    for (const name of readdirSync(migrationDir).filter(f => f.endsWith(".sql")).sort()) {
      if (this.database.prepare("SELECT name FROM _closet_migrations WHERE name=?").get(name)) continue;
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(readFileSync(path.join(migrationDir, name), "utf8"));
        this.database.prepare("INSERT INTO _closet_migrations (name) VALUES (?)").run(name);
        this.database.exec("COMMIT");
      } catch (error) { this.database.exec("ROLLBACK"); throw error; }
    }
  }
  prepare(sql: string) { return new LocalStatement(this.database, sql); }
  close() { this.database.close(); }
  transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.database.exec("COMMIT"); return result; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  async batch(statements: LocalStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try { const results = statements.map(statement => statement.run()); this.database.exec("COMMIT"); return results; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}
export class LocalBucket {
  constructor(private directory: string) {}
  private filePath(key: string) {
    if (!/^[a-f0-9]{64}\/[a-f0-9]{64}$/.test(key)) throw new Error("Invalid image key");
    return path.join(this.directory, "assets", ...key.split("/"));
  }
  async put(key: string, bytes: ArrayBuffer) {
    const target = this.filePath(key); mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, new Uint8Array(bytes)); await rename(temporary, target); }
    finally { if (existsSync(temporary)) await unlink(temporary); }
  }
  async get(key: string) {
    try { const bytes = new Uint8Array(await readFile(this.filePath(key))); return { body: bytes, size: bytes.byteLength }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
}
const stores = globalThis as typeof globalThis & { closetStores?: { directory: string; db: LocalDatabase; bucket: LocalBucket } };
export function localStorage() {
  const directory = dataDirectory();
  if (!stores.closetStores || stores.closetStores.directory !== directory) stores.closetStores = { directory, db: new LocalDatabase(directory), bucket: new LocalBucket(directory) };
  return stores.closetStores;
}
