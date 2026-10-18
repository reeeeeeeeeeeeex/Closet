"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/provider";

export function FabricField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const { t } = useI18n();
  return <div className="field fabric-field">
    <Label htmlFor={id}>{t("面料材质")}</Label>
    <Input id={id} type="text" maxLength={100} value={value} placeholder={t("例如：100% 棉、羊毛混纺或皮革")} onChange={event => onChange(event.target.value)}/>
    <p className="field-hint">{t("可留空，自由填写面料、成分或材质说明。")}</p>
  </div>;
}
