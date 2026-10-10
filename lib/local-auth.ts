import { cookies } from "next/headers";
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { dataDirectory, localStorage } from "./local-storage";

const deriveKey = promisify(scrypt);
export const SESSION_COOKIE = "closet_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
type Credentials = { salt: string; passwordHash: string; secret: string };
type Account = { id: string; username: string; salt: string; password_hash: string; secret: string };
export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
async function legacyCredentials(): Promise<Credentials | null> {
  try { return JSON.parse(await readFile(path.join(dataDirectory(), "auth.json"), "utf8")) as Credentials; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
const accountById = (id: string) => localStorage().db.prepare("SELECT * FROM accounts WHERE id=?").bind(id).first<Account>();
export async function authStatus() {
  const any = await localStorage().db.prepare("SELECT id FROM accounts LIMIT 1").first();
  const legacy = !!await legacyCredentials() && !await accountById("local-owner");
  return { configured: !!any || legacy, legacy };
}
export function setupAllowed() { return ["127.0.0.1", "localhost", "::1"].includes(process.env.CLOSET_HOST || "127.0.0.1"); }
async function matches(password: string, salt: string, hash: string) {
  const actual = await deriveKey(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function authenticate(username: string, password: string) {
  const account = await localStorage().db.prepare("SELECT * FROM accounts WHERE username_key=?").bind(username.toLowerCase()).first<Account>();
  const valid = await matches(password, account?.salt || "missing-account", account?.password_hash || "00".repeat(64));
  if (!account || !valid) throw new AuthError(401, "账号或密码不正确");
  return account;
}
export async function createAccount(username: string, password: string, claimLegacy = false) {
  const legacy = claimLegacy ? await legacyCredentials() : null;
  if (claimLegacy && (!legacy || !await matches(password, legacy.salt, legacy.passwordHash))) throw new AuthError(401, "原衣橱密码不正确");
  const salt = legacy?.salt || randomBytes(32).toString("hex");
  const passwordHash = legacy?.passwordHash || (await deriveKey(password, salt, 64) as Buffer).toString("hex");
  const account = { id: claimLegacy ? "local-owner" : randomUUID(), username, salt, password_hash: passwordHash, secret: legacy?.secret || randomBytes(48).toString("hex") };
  const { db } = localStorage();
  db.transaction(() => {
    if (claimLegacy && db.prepare("SELECT id FROM accounts WHERE id='local-owner'").rows().length) throw new AuthError(409, "旧衣橱已绑定账号，请使用账号登录");
    if (db.prepare("SELECT id FROM accounts WHERE username_key=?").bind(username.toLowerCase()).rows().length) throw new AuthError(409, "此账号已存在，请换一个账号名");
    db.prepare("INSERT INTO accounts (id,username,username_key,salt,password_hash,secret) VALUES (?,?,?,?,?,?)").bind(account.id, username, username.toLowerCase(), salt, passwordHash, account.secret).run();
  });
  return account;
}
function signature(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("hex"); }
export function issueSession(account: Account) {
  const payload = `${account.id}.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signature(payload, account.secret)}`;
}
export async function getLocalUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value; if (!token) return null;
  const parts = token.split(".");
  // Old sessions still identify the original wardrobe while its owner adds a username.
  const old = parts.length === 3;
  const [id, expires, nonce, mac] = old ? ["local-owner", ...parts] : parts;
  if ((!old && parts.length !== 4) || !/^(local-owner|[a-f0-9-]{36})$/.test(id) || !/^\d+$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(mac)) return null;
  if (Number(expires) <= Date.now() / 1000) return null;
  const account = await accountById(id);
  const secret = account?.secret || (old ? (await legacyCredentials())?.secret : undefined);
  if (!secret) return null;
  const payload = old ? `${expires}.${nonce}` : `${id}.${expires}.${nonce}`;
  if (!timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(payload, secret), "hex"))) return null;
  return { userId: id, username: account?.username || null };
}
