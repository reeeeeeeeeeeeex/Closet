"use client";
import { Languages } from "lucide-react";
import { SUPPORTED_LOCALES } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";

export function LanguageSelect() {
  const { t, locale, setLocale } = useI18n();
  return <label className="language-select"><Languages size={16} aria-hidden="true"/><span>{t("语言")}</span><select aria-label={t("语言")} value={locale} onChange={event => setLocale(event.target.value)}>{SUPPORTED_LOCALES.map(option => <option key={option.value} value={option.value} lang={option.value}>{option.label}</option>)}</select></label>;
}
