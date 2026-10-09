import { context, json, failure, sameOrigin, digest, ApiError } from "@/lib/server";
export async function POST(request: Request) {
  try {
    sameOrigin(request); const { owner, db, bucket } = await context();
    if (Number(request.headers.get("content-length") || 0) > 21 * 1024 * 1024) throw new ApiError(413, "单张图片最多 20 MB");
    const file = await request.formData(); const upload = file.get("file");
    if (!(upload instanceof File) || !upload.size) throw new ApiError(400, "请选择图片");
    if (upload.size > 20 * 1024 * 1024) throw new ApiError(413, "单张图片最多 20 MB");
    const bytes = await upload.arrayBuffer(); const b = new Uint8Array(bytes); const ascii = (a: number, z: number) => new TextDecoder().decode(b.slice(a, z));
    const mime = b[0] === 255 && b[1] === 216 && b[2] === 255 ? "image/jpeg" : b[0] === 137 && ascii(1, 4) === "PNG" ? "image/png" : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" ? "image/webp" : ascii(0, 3) === "GIF" ? "image/gif" : ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12)) ? "image/avif" : null;
    if (!mime) throw new ApiError(400, "支持 JPG、PNG、WebP、GIF 和 AVIF 原图。HEIC 请先转换。");
    const hash = await digest(bytes); const ownerHash = await digest(new TextEncoder().encode(owner)); const storageKey = ownerHash + "/" + hash;
    const old = await db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=? AND hash=?").bind(owner, hash).first(); if (old) return json(old);
    await bucket.put(storageKey, bytes); const name = upload.name.slice(0, 255);
    await db.prepare("INSERT OR IGNORE INTO assets (owner,hash,name,mime,size,storage_key,created_at) VALUES (?,?,?,?,?,?,?)").bind(owner, hash, name, mime, bytes.byteLength, storageKey, new Date().toISOString()).run();
    return json({ hash, name, mime, size: bytes.byteLength });
  } catch (e) { return failure(e); }
}
