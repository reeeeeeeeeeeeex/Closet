"use client";
import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LOCALES } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";

export function LanguageSelect() {
  const { t, locale, setLocale } = useI18n();
  return <div className="language-select">
    <span className="language-select-label"><Languages size={16} aria-hidden="true"/><span>{t("语言")}</span></span>
    <Select value={locale} onValueChange={setLocale}>
      <SelectTrigger size="sm" aria-label={t("语言")} className="language-select-trigger">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" position="popper">
        {SUPPORTED_LOCALES.map(option => <SelectItem key={option.value} value={option.value} lang={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
