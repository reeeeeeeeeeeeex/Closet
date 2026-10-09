"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, messageForLocale, resolveLocale, type Translate } from "./core";

const I18nContext = createContext<{ locale: string; t: Translate; setLocale: (locale: string) => void }>({ locale: DEFAULT_LOCALE, t: (source, params) => messageForLocale(DEFAULT_LOCALE, source, params), setLocale: () => {} });
export function I18nProvider({ initialLocale, children }: { initialLocale: string; children: React.ReactNode }) {
  const [locale, setCurrentLocale] = useState(resolveLocale(initialLocale));
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, t: ((source, params) => messageForLocale(locale, source, params)) as Translate,
    setLocale: (next: string) => { const normalized = resolveLocale(next); document.documentElement.lang = normalized; document.cookie = `closet_locale=${encodeURIComponent(normalized)}; Path=/; Max-Age=31536000; SameSite=Lax`; setCurrentLocale(normalized); },
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() { return useContext(I18nContext); }
