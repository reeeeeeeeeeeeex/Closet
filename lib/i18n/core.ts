import zhCN from "./messages/zh-CN.json";

// Source sentences are stable gettext-style keys. Native translations live in
// separate catalogs; user-written names and notes never pass through this layer.
export const DEFAULT_LOCALE = "zh-CN";
export type TranslationMessage = string | { other: string; zero?: string; one?: string; two?: string; few?: string; many?: string };
export const catalogs: Record<string, Record<string, TranslationMessage>> = { "zh-CN": zhCN };
export type TranslationParams = Record<string, string | number>;
export type Translate = (source: string, params?: TranslationParams) => string;
export function resolveLocale(value?: string | null) {
  return Object.keys(catalogs).find(locale => locale.toLowerCase() === value?.toLowerCase()) || DEFAULT_LOCALE;
}
export function clientLocale() { return resolveLocale(typeof document === "undefined" ? DEFAULT_LOCALE : document.documentElement.lang); }
export function messageForLocale(locale: string, source: string, params: TranslationParams = {}) {
  const selected = catalogs[resolveLocale(locale)]; const fallback = catalogs[DEFAULT_LOCALE];
  const localized = (Object.hasOwn(selected, source) ? selected[source] : undefined) || (Object.hasOwn(fallback, source) ? fallback[source] : undefined) || source;
  const message = typeof localized === "string" ? localized : localized[new Intl.PluralRules(resolveLocale(locale)).select(typeof params.count === "number" ? params.count : 0)] || localized.other;
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) => Object.hasOwn(params, name) ? String(params[name]) : match);
}
// Event helpers, validation feedback and streaming backup progress also use the catalog.
export const tr: Translate = (source, params) => messageForLocale(clientLocale(), source, params);
export function translatedOptions<T extends Record<string, string>>(options: T, t: Translate): Record<keyof T, string> {
  return Object.fromEntries(Object.entries(options).map(([key, value]) => [key, t(value)])) as Record<keyof T, string>;
}
