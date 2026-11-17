import { imageMime } from "./image-type";

export const NOTE_MEDIA_TYPES = ["video/mp4", "video/webm", "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"] as const;
export const ASSET_LIMIT = 20 * 1024 * 1024;
export const ASSET_PATH = /^assets\/[a-f0-9]{64}\.(jpeg|png|webp|gif|avif|mp4|webm|mpeg|wav|ogg)$/;

export function assetMime(bytes: Uint8Array, declared = "") {
  const image = imageMime(bytes);
  if (image) return image;
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  if (ascii(4, 8) === "ftyp" && ["isom", "iso2", "iso5", "iso6", "mp41", "mp42", "M4A ", "M4V ", "MSNV", "avc1", "dash"].includes(ascii(8, 12))) {
    return declared === "audio/mp4" || ascii(8, 12) === "M4A " ? "audio/mp4" : "video/mp4";
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && ascii(0, 128).includes("webm")) return "video/webm";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 0xe6) === 0xe2)) return "audio/mpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  return null;
}
