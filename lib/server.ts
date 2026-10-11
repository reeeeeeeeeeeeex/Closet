import { selectedProfile, publicProfile, listStoredProfiles } from "./profiles";
import { getColorLibrary } from "./color-library";
import { localStorage, type LocalDatabase } from "./local-storage";
import { ZodError } from "zod";
import { recordSchema, type ClosetRecord, type Asset, type ClosetState, referencedAssets } from "./domain";
export class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
export async function context(request: Request) {
  const profile = await selectedProfile();
  const expected = [request.headers.get("X-Closet-Profile"), new URL(request.url).searchParams.get("profile")].filter(Boolean);
  if (expected.some(id => id !== profile.id) || (!expected.length && !["GET", "HEAD"].includes(request.method))) throw new ApiError(409, "账号已在其他标签页切换，草稿仍保留。请重新载入当前账号。", "PROFILE_CHANGED");
  const { db, bucket } = localStorage();
  return { owner: profile.id, db, bucket };
}
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
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
export function fromRow(r: Row): ClosetRecord { return recordSchema.parse({ id: r.id, kind: r.kind, data: JSON.parse(r.data), version: r.version, createdAt: r.created_at, updatedAt: r.updated_at }); }
export async function getRecords(db: LocalDatabase, owner: string, collectionId: string) {
  const rows = await db.prepare("SELECT id,kind,data,version,created_at,updated_at FROM records WHERE owner=? AND collection_id=? ORDER BY created_at DESC,id").bind(owner, collectionId).all<Row>();
  return rows.results.map(fromRow);
}
export function getRecordsSync(db: LocalDatabase, owner: string, collectionId: string) {
  return db.prepare("SELECT id,kind,data,version,created_at,updated_at FROM records WHERE owner=? AND collection_id=? ORDER BY created_at DESC,id").bind(owner, collectionId).rows<Row>().map(fromRow);
}
export async function getState(db: LocalDatabase, owner: string, collectionId?: string): Promise<ClosetState> {
  const collections = (await db.prepare("SELECT id,name,created_at AS createdAt FROM collections WHERE owner=? ORDER BY created_at,id").bind(owner).all<{ id: string; name: string; createdAt: string }>()).results;
  const selected = collectionId || collections[0]?.id || "main";
  if (collectionId && selected !== "main" && !collections.some(c => c.id === selected)) throw new ApiError(404, "衣橱不存在");
  const records = await getRecords(db, owner, selected); const hashes = referencedAssets(records);
  const assets = (await db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=?").bind(owner).all<Asset>()).results.filter(a => hashes.has(a.hash));
  return { profile: publicProfile(listStoredProfiles().find(profile => profile.id === owner)!), collections, collectionId: selected, records, assets, colorLibrary: getColorLibrary(db, owner) };
}
export function insertRecord(db: LocalDatabase, owner: string, collectionId: string, r: ClosetRecord) {
  return db.prepare("INSERT INTO records (owner,collection_id,id,kind,data,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(owner, collectionId, r.id, r.kind, JSON.stringify(r.data), r.version, r.createdAt, r.updatedAt);
}
export async function digest(bytes: BufferSource) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join(""); }
