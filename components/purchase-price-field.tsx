"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/provider";

export function PurchasePriceField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const { t } = useI18n();
  return <div className="field purchase-price-field">
    <Label htmlFor={id}>{t("购买价格")}</Label>
    <Input id={id} type="text" maxLength={100} value={value} placeholder={t("例如：¥299、约200元或赠品")} onChange={event => onChange(event.target.value)}/>
  </div>;
}
