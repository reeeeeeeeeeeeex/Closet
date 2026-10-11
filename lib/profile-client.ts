let profileId: string | null = null;
let operations = 0;
const listeners = new Set<() => void>();
const changed = new Set<() => void>();
export const setProfileContext = (id: string) => { profileId = id; };
export const getProfileContext = () => profileId;
export const getOperationCount = () => operations;
export const subscribeOperations = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const subscribeProfileChanges = (listener: () => void) => { changed.add(listener); return () => { changed.delete(listener); }; };
export const announceProfileChange = () => changed.forEach(listener => listener());
export async function withProfileActivity<T>(work: () => Promise<T>): Promise<T> {
  operations++; listeners.forEach(listener => listener());
  try { return await work(); }
  finally { operations--; listeners.forEach(listener => listener()); }
}
export function profileFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (profileId && !path.startsWith("/api/profiles")) headers.set("X-Closet-Profile", profileId);
  return fetch(path, { ...init, headers, cache: "no-store" });
}
export const assetUrl = (hash: string, id = profileId) => `/api/assets/${hash}${id ? `?profile=${encodeURIComponent(id)}` : ""}`;
