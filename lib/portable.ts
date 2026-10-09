import { tr } from "./i18n/core";
import { Zip, ZipPassThrough, Unzip, UnzipInflate, strToU8, strFromU8 } from "fflate";
import { validateArchive, type ClosetArchive, type ClosetState, type Asset } from "./domain";
export class ApiClientError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, cache: "no-store" });
    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new Error(tr("连接中断，请检查网络后重试"));
    }
    if (!response.ok)
        throw new ApiClientError(response.status, tr((data as {
            error?: string;
        }).error || "请求失败"));
    return data as T;
}
export async function uploadAsset(file: File): Promise<Asset> {
    if (file.size > 20 * 1024 * 1024)
        throw new Error(tr("单张图片最多 20 MB"));
    const body = new FormData();
    body.append("file", file);
    return api<Asset>("/api/assets", { method: "POST", body });
}
export const hashBytes = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))).map(b => b.toString(16).padStart(2, "0")).join("");
const imagePath = (a: Asset) => `assets/${a.hash}.${a.mime.split("/")[1]}`;
export const manifestFromState = (state: ClosetState): ClosetArchive => validateArchive({ format: "new-closet", schemaVersion: 4, exportedAt: new Date().toISOString(), collection: { name: state.collections.find(c => c.id === state.collectionId)?.name || tr("我的衣橱") }, records: state.records, assets: state.assets });
export async function exportArchive(state: ClosetState, progress: (message: string) => void): Promise<Blob> {
    const manifest = manifestFromState(state);
    const blobs: Blob[] = [];
    let zipError: Error | null = null;
    const zip = new Zip((error, data) => { if (error)
        zipError = error;
    else
        blobs.push(new Blob([data as BlobPart])); });
    const add = (name: string, bytes: Uint8Array) => { const f = new ZipPassThrough(name); zip.add(f); f.push(bytes, true); if (zipError)
        throw zipError; };
    add("manifest.json", strToU8(JSON.stringify(manifest, null, 2)));
    add("README.txt", strToU8("New Closet backup v4\nmanifest.json contains all records, nested subsets and memberships, clothing fits/measurements, shoe sizes, outfit photos, relationships, snapshots and original filenames.\nassets/ contains exact original bytes, named by SHA-256.\nImages and JSON can be opened independently of this app.\n"));
    for (const [index, asset] of manifest.assets.entries()) {
        progress(tr("正在打包原图 {value1} / {value2}", { value1: index + 1, value2: manifest.assets.length }));
        const response = await fetch(`/api/assets/${asset.hash}`, { cache: "no-store" });
        if (!response.ok)
            throw new Error(tr("原图读取失败，备份未生成，请重试"));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== asset.size || await hashBytes(bytes) !== asset.hash)
            throw new Error(tr("原图校验失败，备份已停止"));
        add(imagePath(asset), bytes);
    }
    zip.end();
    if (zipError)
        throw zipError;
    return new Blob(blobs, { type: "application/zip" });
}
// Two streaming passes: verify everything before preview, then upload one file at a time.
// The browser never expands the entire image collection into an in-memory object.
async function walkArchive(file: File, visit: (name: string, bytes: Uint8Array) => Promise<void>) {
    if (file.size > 2 * 1024 * 1024 * 1024)
        throw new Error(tr("首版支持 2 GB 以内的备份包"));
    let error: Error | null = null;
    let pending: Promise<void>[] = [];
    let count = 0;
    let total = 0;
    const names = new Set<string>();
    const unzip = new Unzip(entry => {
        if (++count > 4002) {
            error = new Error(tr("备份文件数量超出限制"));
            return;
        }
        if (names.has(entry.name)) {
            error = new Error(tr("备份中有重复文件"));
            return;
        }
        names.add(entry.name);
        if (entry.name === "README.txt" || entry.name.endsWith("/"))
            return;
        if (entry.name !== "manifest.json" && !/^assets\/[a-f0-9]{64}\.(jpeg|png|webp|gif|avif)$/.test(entry.name)) {
            error = new Error(tr("备份含有无法识别的文件路径"));
            return;
        }
        const limit = entry.name === "manifest.json" ? 3 * 1024 * 1024 : 20 * 1024 * 1024;
        if (entry.originalSize && entry.originalSize > limit) {
            error = new Error(tr("备份中的单个文件过大"));
            return;
        }
        let size = 0;
        const chunks: Uint8Array[] = [];
        entry.ondata = (err, data, final) => {
            if (err) {
                error = err;
                return;
            }
            size += data.length;
            total += data.length;
            if (size > limit || total > 2 * 1024 * 1024 * 1024) {
                error = new Error(tr("备份解压大小超出限制"));
                entry.terminate();
                return;
            }
            chunks.push(data);
            if (final) {
                const bytes = new Uint8Array(size);
                let offset = 0;
                for (const c of chunks) {
                    bytes.set(c, offset);
                    offset += c.length;
                }
                chunks.length = 0;
                pending.push(visit(entry.name, bytes));
            }
        };
        entry.start();
    });
    unzip.register(UnzipInflate);
    const reader = file.stream().getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            unzip.push(value || new Uint8Array(), done);
            if (error)
                throw error;
            await Promise.all(pending);
            pending = [];
            if (done)
                break;
        }
    }
    finally {
        await reader.cancel();
    }
    if (!names.has("manifest.json"))
        throw new Error(tr("没有找到 manifest.json"));
}
export async function inspectArchive(file: File, progress: (message: string) => void): Promise<ClosetArchive> {
    let manifest: ClosetArchive | null = null;
    const images = new Map<string, number>();
    await walkArchive(file, async (name, bytes) => {
        if (name === "manifest.json") {
            manifest = validateArchive(JSON.parse(strFromU8(bytes)));
            return;
        }
        progress(tr("校验原图 {value1}", { value1: images.size + 1 }));
        const hash = await hashBytes(bytes);
        if (!name.startsWith("assets/" + hash + "."))
            throw new Error(tr("图片内容与 SHA-256 不一致，备份可能已损坏"));
        images.set(name, bytes.length);
    });
    if (!manifest)
        throw new Error(tr("备份清单不存在"));
    const result = manifest as ClosetArchive;
    for (const asset of result.assets)
        if (images.get(imagePath(asset)) !== asset.size)
            throw new Error(tr("备份原图缺失或大小不匹配"));
    if (images.size !== result.assets.length)
        throw new Error(tr("图片清单与实际文件数量不一致"));
    return result;
}
export async function importArchive(file: File, manifest: ClosetArchive, progress: (message: string) => void): Promise<string> {
    const assets = new Map(manifest.assets.map(a => [imagePath(a), a]));
    let uploaded = 0;
    await walkArchive(file, async (name, bytes) => {
        if (name === "manifest.json")
            return;
        const a = assets.get(name);
        if (!a)
            throw new Error(tr("图片未列入备份清单"));
        progress(tr("恢复原图 {value1} / {value2}", { value1: ++uploaded, value2: manifest.assets.length }));
        const saved = await uploadAsset(new File([bytes as BlobPart], a.name, { type: a.mime }));
        if (saved.hash !== a.hash || saved.size !== a.size || saved.mime !== a.mime)
            throw new Error(tr("图片恢复校验失败"));
    });
    progress(tr("正在整体写入衣橱记录\u2026"));
    const result = await api<{
        collectionId: string;
    }>("/api/closet", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(manifest) });
    return result.collectionId;
}
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
