"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, messageForLocale, resolveLocale, type Translate } from "./core";

const I18nContext = createContext<{ locale: string; t: Translate; setLocale: (locale: string) => void }>({ locale: DEFAULT_LOCALE, t: (source, params) => messageForLocale(DEFAULT_LOCALE, source, params), setLocale: () => {} });
export function I18nProvider({ initialLocale, children, persistLocally = false }: { initialLocale: string; children: React.ReactNode; persistLocally?: boolean }) {
  const [locale, setCurrentLocale] = useState(resolveLocale(initialLocale));
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messageForLocale(locale, "New Closet · 我的衣橱");
    document.querySelector('meta[name="description"]')?.setAttribute("content", messageForLocale(locale, "原图、搭配和穿搭日历。属于你，也能随时带走的私人衣橱。"));
  }, [locale]);
  const value = useMemo(() => ({ locale, t: ((source, params) => messageForLocale(locale, source, params)) as Translate,
    setLocale: (next: string) => {
      const normalized = resolveLocale(next);
      document.documentElement.lang = normalized;
      document.cookie = `closet_locale=${encodeURIComponent(normalized)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      if (persistLocally) { try { localStorage.setItem(LOCALE_STORAGE_KEY, normalized); } catch { /* Still switch for this session if storage is unavailable. */ } }
      setCurrentLocale(normalized);
    },
  }), [locale, persistLocally]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() { return useContext(I18nContext); }
