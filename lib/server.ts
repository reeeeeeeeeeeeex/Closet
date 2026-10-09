import { getLocalUser } from "./local-auth";
import { localStorage, type LocalDatabase } from "./local-storage";
import { ZodError } from "zod";
import { type ClosetRecord, type Asset, type ClosetState, referencedAssets } from "./domain";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function context() {
  const user = await getLocalUser();
  if (!user) throw new ApiError(401, "请先登录后再访问衣橱");
  const { db, bucket } = localStorage();
  return { owner: user.userId, db, bucket };
}
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message || "内容格式不正确" }, 400);
  console.error("Closet operation failed", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "操作未完成，请稍后重试。原有数据没有被覆盖。" }, 500);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const target = new URL(request.url);
  const host = request.headers.get("host") || target.host;
  if (origin !== `${target.protocol}//${host}`) throw new ApiError(403, "请求来源不匹配");
}
export async function limitedJson(request: Request, max = 3 * 1024 * 1024) {
  const reader = request.body?.getReader(); if (!reader) throw new ApiError(400, "请求为空");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new ApiError(413, "记录过大，请分开导入"); } chunks.push(value); }
  const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new ApiError(400, "JSON 格式不正确"); }
}
type Row = { id: string; kind: string; data: string; version: number; created_at: string; updated_at: string };
export function fromRow(r: Row): ClosetRecord { return { id: r.id, kind: r.kind, data: JSON.parse(r.data), version: r.version, createdAt: r.created_at, updatedAt: r.updated_at } as ClosetRecord; }
export async function getRecords(db: LocalDatabase, owner: string, collectionId: string) {
  const rows = await db.prepare("SELECT id,kind,data,version,created_at,updated_at FROM records WHERE owner=? AND collection_id=? ORDER BY created_at DESC,id").bind(owner, collectionId).all<Row>();
  return rows.results.map(fromRow);
}
export async function getState(db: LocalDatabase, owner: string, collectionId?: string): Promise<ClosetState> {
  const collections = (await db.prepare("SELECT id,name,created_at AS createdAt FROM collections WHERE owner=? ORDER BY created_at,id").bind(owner).all<{ id: string; name: string; createdAt: string }>()).results;
  const selected = collectionId || collections[0]?.id || "main";
  if (collectionId && selected !== "main" && !collections.some(c => c.id === selected)) throw new ApiError(404, "衣橱不存在");
  const records = await getRecords(db, owner, selected); const hashes = referencedAssets(records);
  const assets = (await db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).all<Asset>()).results.filter(a => hashes.has(a.hash));
  return { collections, collectionId: selected, records, assets };
}
export function insertRecord(db: LocalDatabase, owner: string, collectionId: string, r: ClosetRecord) {
  return db.prepare("INSERT INTO records (owner,collection_id,id,kind,data,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(owner, collectionId, r.id, r.kind, JSON.stringify(r.data), r.version, r.createdAt, r.updatedAt);
}
export async function digest(bytes: BufferSource) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join(""); }
