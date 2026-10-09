import { cookies } from "next/headers";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { dataDirectory } from "./local-storage";

const deriveKey = promisify(scrypt);
export const SESSION_COOKIE = "closet_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
type Credentials = { salt: string; passwordHash: string; secret: string };
const credentialsPath = () => path.join(dataDirectory(), "auth.json");
async function credentials(): Promise<Credentials | null> {
  try { return JSON.parse(await readFile(credentialsPath(), "utf8")) as Credentials; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function passwordConfigured() { return !!await credentials(); }
export function setupAllowed() { return ["127.0.0.1", "localhost", "::1"].includes(process.env.CLOSET_HOST || "127.0.0.1"); }
export async function createPassword(password: string) {
  const salt = randomBytes(32).toString("hex");
  const passwordHash = (await deriveKey(password, salt, 64) as Buffer).toString("hex");
  await mkdir(dataDirectory(), { recursive: true });
  await writeFile(credentialsPath(), JSON.stringify({ salt, passwordHash, secret: randomBytes(48).toString("hex") }), { flag: "wx", mode: 0o600 });
}
export async function checkPassword(password: string) {
  const saved = await credentials(); if (!saved) return false;
  const hash = await deriveKey(password, saved.salt, 64) as Buffer;
  const expected = Buffer.from(saved.passwordHash, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
function signature(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("hex"); }
export async function issueSession() {
  const saved = await credentials(); if (!saved) throw new Error("Password has not been configured");
  const payload = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signature(payload, saved.secret)}`;
}
export async function getLocalUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value; if (!token) return null;
  const saved = await credentials(); if (!saved) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return null;
  if (Number(parts[0]) <= Date.now() / 1000) return null;
  const expected = signature(`${parts[0]}.${parts[1]}`, saved.secret);
  if (!timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(expected, "hex"))) return null;
  return { userId: "local-owner" };
}
