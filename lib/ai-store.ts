import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { localStorage } from "./local-storage";
import { ApiError } from "./server";
import { ensureCloset } from "./closet-service";
import { TOOL_SCOPES, type ModelSettings, type McpConnection, type ToolActivity, type ToolScope } from "./ai-types";

export const scopesSchema = z.array(z.enum(TOOL_SCOPES)).min(1).max(4).refine(s => s.includes("read") && new Set(s).size === s.length, "需保留读取资料权限，权限不能重复");
const baseUrlSchema = z.string().trim().max(1000).transform(value => value.replace(/\/+$/, "")).superRefine((value, ctx) => {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw Error();
  } catch { ctx.addIssue({ code: "custom", message: "请输入 HTTPS 服务地址；本机模型可使用 HTTP 地址" }); }
});
export const settingsSchema = z.object({ provider: z.enum(["openai", "anthropic"]), baseUrl: baseUrlSchema, model: z.string().trim().min(1, "请填写模型名").max(200), apiKey: z.string().trim().max(4000).optional(), scopes: scopesSchema }).strict();
type SettingsRow = { provider: "openai" | "anthropic"; base_url: string; model: string; encrypted_key: string; scopes: string };
function key(owner: string) {
  const row = localStorage().db.prepare("SELECT secret FROM accounts WHERE id=?").bind(owner).rows<{ secret: string }>()[0];
  if (!row) throw new ApiError(404, "账号不存在");
  return createHash("sha256").update("closet-model-key:" + row.secret).digest();
}
function encrypt(owner: string, value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(owner), iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(b => b.toString("base64")).join(".");
}
function decrypt(owner: string, value: string) {
  const [iv, tag, bytes] = value.split(".").map(v => Buffer.from(v, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key(owner), iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8");
}
export function modelSettings(owner: string, includeKey = false) {
  const row = localStorage().db.prepare("SELECT provider,base_url,model,encrypted_key,scopes FROM ai_settings WHERE owner=?").bind(owner).rows<SettingsRow>()[0];
  if (!row) return null;
  const result: ModelSettings = { provider: row.provider, baseUrl: row.base_url, model: row.model, hasKey: !!row.encrypted_key, scopes: scopesSchema.parse(JSON.parse(row.scopes)) };
  return { ...result, ...(includeKey ? { apiKey: decrypt(owner, row.encrypted_key) } : {}) };
}
export function saveModelSettings(owner: string, input: unknown) {
  const body = settingsSchema.parse(input), { db } = localStorage();
  const old = db.prepare("SELECT provider,base_url,encrypted_key FROM ai_settings WHERE owner=?").bind(owner).rows<SettingsRow>()[0];
  if (!body.apiKey && (!old || old.provider !== body.provider || old.base_url !== body.baseUrl)) throw new ApiError(400, "首次配置或更换服务地址时，请填写 API Key；无密钥的本机服务可填写 local");
  const encrypted = body.apiKey ? encrypt(owner, body.apiKey) : old.encrypted_key;
  db.prepare("INSERT INTO ai_settings VALUES (?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,encrypted_key=excluded.encrypted_key,scopes=excluded.scopes").bind(owner, body.provider, body.baseUrl, body.model, encrypted, JSON.stringify(body.scopes)).run();
  return modelSettings(owner);
}
const connectionSchema = z.object({ name: z.string().trim().min(1).max(100), collectionId: z.string().min(1).max(100), scopes: scopesSchema }).strict();
export function listConnections(owner: string): McpConnection[] {
  return localStorage().db.prepare("SELECT id,name,collection_id AS collectionId,scopes,created_at AS createdAt FROM mcp_connections WHERE owner=? ORDER BY created_at DESC,id").bind(owner).rows<Omit<McpConnection, "scopes"> & { scopes: string }>().map(c => ({ ...c, scopes: scopesSchema.parse(JSON.parse(c.scopes)) }));
}
export function createConnection(owner: string, input: unknown) {
  const body = connectionSchema.parse(input), { db } = localStorage();
  ensureCloset(db, owner, body.collectionId);
  if (listConnections(owner).length >= 30) throw new ApiError(400, "最多保存 30 个连接，请先撤销不用的连接");
  const token = randomBytes(32).toString("hex"), id = randomUUID(), createdAt = new Date().toISOString();
  db.prepare("INSERT INTO mcp_connections VALUES (?,?,?,?,?,?,?)").bind(id, owner, body.collectionId, body.name, createHash("sha256").update(token).digest("hex"), JSON.stringify(body.scopes), createdAt).run();
  return { connection: { ...body, id, createdAt }, token };
}
export function revokeConnection(owner: string, id: string) { localStorage().db.prepare("DELETE FROM mcp_connections WHERE owner=? AND id=?").bind(owner, id).run(); }
export function authenticateMcp(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const row = token ? localStorage().db.prepare("SELECT id,owner,collection_id,name,scopes FROM mcp_connections WHERE token_hash=?").bind(createHash("sha256").update(token).digest("hex")).rows<{ id: string; owner: string; collection_id: string; name: string; scopes: string }>()[0] : undefined;
  if (!row) throw new ApiError(401, "MCP 连接未授权或已撤销");
  return { owner: row.owner, collectionId: row.collection_id, scopes: scopesSchema.parse(JSON.parse(row.scopes)), source: row.name, connectionId: row.id };
}
export function recordActivity(owner: string, source: string, tool: string, collectionId: string, ok: boolean) {
  const { db } = localStorage();
  db.transaction(() => {
    db.prepare("INSERT INTO tool_activity VALUES (?,?,?,?,?,?,?)").bind(randomUUID(), owner, source, tool, collectionId, Number(ok), new Date().toISOString()).run();
    db.prepare("DELETE FROM tool_activity WHERE owner=? AND id NOT IN (SELECT id FROM tool_activity WHERE owner=? ORDER BY created_at DESC,rowid DESC LIMIT 200)").bind(owner, owner).run();
  });
}
export function listActivity(owner: string): ToolActivity[] {
  return localStorage().db.prepare("SELECT id,source,tool,collection_id AS collectionId,ok,created_at AS createdAt FROM tool_activity WHERE owner=? ORDER BY created_at DESC,rowid DESC LIMIT 30").bind(owner).rows<Omit<ToolActivity, "ok"> & { ok: number }>().map(row => ({ ...row, ok: !!row.ok }));
}
export type ToolContext = { owner: string; collectionId: string; scopes: ToolScope[]; source: string; connectionId?: string; signal?: AbortSignal };
