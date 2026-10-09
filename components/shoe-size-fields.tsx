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
    <Input id={`${id}-${key}`} type="number" inputMode="decimal" min={key === "eu" ? 10 : 100} max={key === "eu" ? 60 : 350} step={key === "eu" ? "any" : 5} list={`${id}-${key}-options`} placeholder={t("未填写")} value={value[key] ?? ""} onChange={event => onChange({ ...value, [key]: event.target.value === "" ? null : Number(event.target.value) })}/>
    <datalist id={`${id}-${key}-options`}>{Array.from({ length: key === "eu" ? 101 : 51 }, (_, index) => key === "eu" ? 10 + index / 2 : 100 + index * 5).map(size => <option key={size} value={size}/>)}</datalist>
  </div>)}</div>;
}
