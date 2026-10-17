"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonalSizes } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/provider";

export function ShoeSizeFields({ value, onChange }: { value: PersonalSizes["shoeSize"]; onChange: (value: PersonalSizes["shoeSize"]) => void }) {
  const { t } = useI18n(); const id = useId();
  return <div className="field-pair">{(["eu", "cn"] as const).map(key => <div className="field" key={key}>
    <Label htmlFor={`${id}-${key}`}>{key === "eu" ? t("欧码（EU）") : t("中国码（mm）")}</Label>
    <Input id={`${id}-${key}`} type="text" maxLength={100} placeholder={key === "eu" ? t("例如：38/39") : t("例如：约240或240–245")} value={value[key] ?? ""} onChange={event => onChange({ ...value, [key]: event.target.value === "" ? null : event.target.value })}/>
  </div>)}</div>;
}
