import zhCN from "./messages/zh-CN.json";
import en from "./messages/en.json";

// Source sentences are stable gettext-style keys. Native translations live in
// separate catalogs; user-written names and notes never pass through this layer.
export const DEFAULT_LOCALE = "en";
export const SOURCE_LOCALE = "zh-CN";
export const LOCALE_STORAGE_KEY = "closet_locale";
export const SUPPORTED_LOCALES = [{ value: "en", label: "English" }, { value: "zh-CN", label: "简体中文" }] as const;
export type TranslationMessage = string | { other: string; zero?: string; one?: string; two?: string; few?: string; many?: string };
export const catalogs: Record<string, Record<string, TranslationMessage>> = { en, "zh-CN": zhCN };
export type TranslationParams = Record<string, string | number>;
export type Translate = (source: string, params?: TranslationParams) => string;
export function resolveLocale(value?: string | null) {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-");
  return Object.keys(catalogs).find(locale => locale.toLowerCase() === normalized) || (normalized?.startsWith("en-") ? "en" : DEFAULT_LOCALE);
}
export function savedClientLocale() {
  try { return resolveLocale(localStorage.getItem(LOCALE_STORAGE_KEY)); } catch { return DEFAULT_LOCALE; }
}
export function clientLocale() { return resolveLocale(typeof document === "undefined" ? DEFAULT_LOCALE : document.documentElement.lang); }
// These messages cross the server/native boundary as plain text. Match only
// known application errors; names, notes, and other user content are untouched.
const errorPatterns = [
  { pattern: /^模型服务返回 (\d+)，请检查模型名、密钥、额度与工具\/视觉支持$/, source: "模型服务返回 {value}，请检查模型名、密钥、额度与工具/视觉支持" },
  { pattern: /^缺少参数: (.+)$/, source: "缺少参数: {value}" },
  { pattern: /^原图上传失败 \((\d+)\)$/, source: "原图上传失败 ({value})" },
  { pattern: /^原图下载失败 \((\d+)\)$/, source: "原图下载失败 ({value})" },
];
export function messageForLocale(locale: string, source: string, params: TranslationParams = {}) {
  const selected = catalogs[resolveLocale(locale)]; const fallback = catalogs[SOURCE_LOCALE];
  if (!Object.hasOwn(selected, source) && !Object.hasOwn(fallback, source)) {
    for (const entry of errorPatterns) {
      const match = entry.pattern.exec(source);
      if (match) return messageForLocale(locale, entry.source, { value: match[1] });
    }
  }
  const localized = (Object.hasOwn(selected, source) ? selected[source] : undefined) || (Object.hasOwn(fallback, source) ? fallback[source] : undefined) || source;
  const message = typeof localized === "string" ? localized : localized[new Intl.PluralRules(resolveLocale(locale)).select(typeof params.count === "number" ? params.count : 0)] || localized.other;
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) => Object.hasOwn(params, name) ? String(params[name]) : match);
}
// Event helpers, validation feedback and streaming backup progress also use the catalog.
export const tr: Translate = (source, params) => messageForLocale(clientLocale(), source, params);
export function importedWardrobeName(name: string, locale = clientLocale()) {
  const suffix = messageForLocale(locale, " · 导入");
  return name.slice(0, 100 - suffix.length) + suffix;
}
export function translatedOptions<T extends Record<string, string>>(options: T, t: Translate): Record<keyof T, string> {
  return Object.fromEntries(Object.entries(options).map(([key, value]) => [key, t(value)])) as Record<keyof T, string>;
}
