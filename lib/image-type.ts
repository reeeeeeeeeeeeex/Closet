export function imageMime(b: Uint8Array) {
  const ascii = (a:number,z:number) => new TextDecoder().decode(b.slice(a,z));
  return b[0] === 255 && b[1] === 216 && b[2] === 255 ? "image/jpeg" : b[0] === 137 && ascii(1,4) === "PNG" ? "image/png" : ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP" ? "image/webp" : ascii(0,3) === "GIF" ? "image/gif" : ascii(4,8) === "ftyp" && ["avif","avis"].includes(ascii(8,12)) ? "image/avif" : null;
}
