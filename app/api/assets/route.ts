import { context, json, failure, sameOrigin, digest, ApiError } from "@/lib/server";
import { ASSET_LIMIT, assetMime } from "@/lib/asset-type";
import { imageMime } from "@/lib/image-type";
export async function POST(request: Request) {
  try {
    sameOrigin(request); const { owner, db, bucket } = await context(request);
    if (Number(request.headers.get("content-length") || 0) > ASSET_LIMIT + 1024 * 1024) throw new ApiError(413, "单个文件最多 20 MB");
    const file = await request.formData(); const upload = file.get("file");
    const attachment = file.get("attachment") === "true";
    if (!(upload instanceof File) || !upload.size) throw new ApiError(400, attachment ? "请选择非空附件" : "请选择图片");
    if (upload.size > ASSET_LIMIT) throw new ApiError(413, "单个文件最多 20 MB");
    const bytes = await upload.arrayBuffer();
    const mime = attachment ? assetMime(new Uint8Array(bytes), upload.type || (/\.m4a$/i.test(upload.name) ? "audio/mp4" : "")) : imageMime(new Uint8Array(bytes));
    if (!mime) throw new ApiError(400, attachment ? "附件格式不受支持" : "支持 JPG、PNG、WebP、GIF 和 AVIF 原图。HEIC 请先转换。");
    const hash = await digest(bytes); const ownerHash = await digest(new TextEncoder().encode(owner)); const storageKey = ownerHash + "/" + hash;
    const old = await db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=? AND hash=?").bind(owner, hash).first(); if (old) return json(old);
    await bucket.put(storageKey, bytes); const name = upload.name.slice(0, 255);
    await db.prepare("INSERT OR IGNORE INTO assets (owner,hash,name,mime,size,storage_key,created_at) VALUES (?,?,?,?,?,?,?)").bind(owner, hash, name, mime, bytes.byteLength, storageKey, new Date().toISOString()).run();
    return json({ hash, name, mime, size: bytes.byteLength });
  } catch (e) { return failure(e); }
}
