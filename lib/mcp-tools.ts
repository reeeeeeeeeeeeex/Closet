import sharp from "sharp";
import { localStorage } from "./local-storage";
import { ApiError, getRecordsSync } from "./server";
import { saveClosetMutation } from "./closet-service";
import { recordActivity, scopesSchema, type ToolContext } from "./ai-store";
import { createToolsServer, connectToolsMcp, McpToolError, type ClosetToolsAdapter } from "./mcp-core";
function adapter(ctx: ToolContext): ClosetToolsAdapter {
  return {
    async records(scope) {
      ctx.signal?.throwIfAborted();
      const { db } = localStorage();
      if (!ctx.scopes.includes(scope)) throw new McpToolError(403, "此连接没有相应权限");
      if (ctx.connectionId) {
        const active = db.prepare("SELECT scopes FROM mcp_connections WHERE id=? AND owner=? AND collection_id=?").bind(ctx.connectionId, ctx.owner, ctx.collectionId).rows<{ scopes: string }>()[0];
        if (!active || !scopesSchema.parse(JSON.parse(active.scopes)).includes(scope)) throw new McpToolError(401, "MCP 连接未授权或已撤销");
      }
      if (!db.prepare("SELECT id FROM collections WHERE owner=? AND id=?").bind(ctx.owner, ctx.collectionId).rows().length) throw new McpToolError(404, "衣橱不存在");
      return getRecordsSync(db, ctx.owner, ctx.collectionId);
    },
    async collection() { return localStorage().db.prepare("SELECT id,name FROM collections WHERE owner=? AND id=?").bind(ctx.owner, ctx.collectionId).rows<{ id: string; name: string }>()[0]; },
    async preview(hash, size) {
      const { db, bucket } = localStorage();
      const asset = db.prepare("SELECT storage_key FROM assets WHERE owner=? AND hash=?").bind(ctx.owner, hash).rows<{ storage_key: string }>()[0];
      const original = asset ? await bucket.get(asset.storage_key) : null;
      if (!original) throw new McpToolError(404, "原图暂时不可用");
      let image: Buffer;
      try { image = await sharp(original.body, { limitInputPixels: 40_000_000, animated: false }).rotate().resize(size, size, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer(); }
      catch { throw new McpToolError(400, "图片无法生成预览，请检查格式或尺寸"); }
      if (image.length > 1500 * 1024) throw new McpToolError(413, "图片预览过大，请改用 1024 尺寸");
      return { data: image.toString("base64"), mimeType: "image/jpeg" };
    },
    async save(input, requestId) {
      try { return saveClosetMutation(localStorage().db, ctx.owner, input, requestId); }
      catch (error) { if (error instanceof ApiError) throw new McpToolError(error.status, error.message); throw error; }
    },
    async activity(name, ok) { recordActivity(ctx.owner, ctx.source, name, ctx.collectionId, ok); },
  };
}
export function createClosetMcpServer(ctx: ToolContext) { return createToolsServer(ctx, adapter(ctx)); }
export function connectInternalMcp(ctx: ToolContext) { return connectToolsMcp(ctx, adapter(ctx)); }
