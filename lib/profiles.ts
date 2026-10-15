import { cookies } from "next/headers";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataDirectory, localStorage } from "./local-storage";
import type { Profile } from "./profile-types";

export const SESSION_COOKIE = "closet_session";
export const SESSION_SECONDS = 365 * 24 * 60 * 60;
type StoredProfile = { id: string; username: string; username_key: string; secret: string };
export class ProfileError extends Error { constructor(public status: number, message: string) { super(message); } }
export const profileNameKey = (name: string) => name.trim().toLowerCase();
export const publicProfile = (profile: StoredProfile): Profile => ({ id: profile.id, name: profile.username });
export function ensureProfiles() {
  const { db } = localStorage();
  db.transaction(() => {
    const file = path.join(dataDirectory(), "auth.json");
    const legacyData = db.prepare("SELECT owner FROM collections WHERE owner='local-owner' UNION SELECT owner FROM records WHERE owner='local-owner' UNION SELECT owner FROM assets WHERE owner='local-owner'").rows().length > 0;
    if ((legacyData || existsSync(file)) && !db.prepare("SELECT id FROM accounts WHERE id='local-owner'").rows().length) {
      let secret = randomBytes(48).toString("hex");
      try { const legacy = JSON.parse(readFileSync(file, "utf8")); if (typeof legacy.secret === "string" && legacy.secret.length >= 32) secret = legacy.secret; } catch { /* Old records remain usable even without the retired credential file. */ }
      let name = "原衣橱", suffix = 2;
      while (db.prepare("SELECT id FROM accounts WHERE username_key=?").bind(profileNameKey(name)).rows().length) name = `原衣橱 ${suffix++}`;
      db.prepare("INSERT INTO accounts (id,username,username_key,secret) VALUES (?,?,?,?)").bind("local-owner", name, profileNameKey(name), secret).run();
    }
    if (!db.prepare("SELECT id FROM accounts LIMIT 1").rows().length) db.prepare("INSERT INTO accounts (id,username,username_key,secret) VALUES (?,?,?,?)").bind(randomUUID(), "Me", "me", randomBytes(48).toString("hex")).run();
  });
}
export function listStoredProfiles(): StoredProfile[] {
  ensureProfiles();
  return localStorage().db.prepare("SELECT id,username,username_key,secret FROM accounts ORDER BY CASE WHEN id='local-owner' THEN 0 ELSE 1 END,username_key,id").rows<StoredProfile>();
}
export function createProfile(name: string): StoredProfile {
  ensureProfiles();
  const profile = { id: randomUUID(), username: name.trim(), username_key: profileNameKey(name), secret: randomBytes(48).toString("hex") };
  const { db } = localStorage();
  db.transaction(() => {
    if (db.prepare("SELECT id FROM accounts WHERE username_key=?").bind(profile.username_key).rows().length) throw new ProfileError(409, "此账号名称已存在，请换一个名称");
    db.prepare("INSERT INTO accounts (id,username,username_key,secret) VALUES (?,?,?,?)").bind(profile.id, profile.username, profile.username_key, profile.secret).run();
  });
  return profile;
}
export function renameProfile(id: string, name: string): StoredProfile {
  const { db } = localStorage();
  return db.transaction(() => {
    const profile = db.prepare("SELECT * FROM accounts WHERE id=?").bind(id).rows<StoredProfile>()[0];
    if (!profile) throw new ProfileError(404, "账号不存在");
    const key = profileNameKey(name);
    if (db.prepare("SELECT id FROM accounts WHERE username_key=? AND id<>?").bind(key, id).rows().length) throw new ProfileError(409, "此账号名称已存在，请换一个名称");
    db.prepare("UPDATE accounts SET username=?,username_key=? WHERE id=?").bind(name.trim(), key, id).run();
    return { ...profile, username: name.trim(), username_key: key };
  });
}
const signature = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("hex");
export function issueSession(profile: StoredProfile) {
  const payload = `${profile.id}.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signature(payload, profile.secret)}`;
}
export async function selectedProfile(): Promise<StoredProfile> {
  const profiles = listStoredProfiles();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const parts = token.split("."), old = parts.length === 3;
    const [id, expires, nonce, mac] = old ? ["local-owner", ...parts] : parts;
    const profile = profiles.find(profile => profile.id === id);
    if (profile && (old || parts.length === 4) && /^\d+$/.test(expires) && Number(expires) > Date.now() / 1000 && /^[a-f0-9]{32}$/.test(nonce) && /^[a-f0-9]{64}$/.test(mac)) {
      const payload = old ? `${expires}.${nonce}` : `${id}.${expires}.${nonce}`;
      if (timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(payload, profile.secret), "hex"))) return profile;
    }
  }
  return profiles[0];
}
