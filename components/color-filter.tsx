"use client";
import { useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ColorOptions } from "@/components/color-field";
import { colorKey, isCommonColor, type ColorValue } from "@/lib/colors";
import { useI18n } from "@/lib/i18n/provider";

export function ColorFilter({ colors, selected, onChange }: { colors: ColorValue[]; selected: string[]; onChange: (keys: string[]) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const visible = colors.filter(color => [color.name, color.hex || "", isCommonColor(color) ? t(color.name) : ""].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Popover onOpenChange={open => { if (!open) setQuery(""); }}><PopoverTrigger asChild><Button type="button" variant="outline" className="color-filter-trigger" aria-label={t("颜色筛选")}><Palette size={16}/>{t("颜色")}{selected.length > 0 && <span>{selected.length}</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" collisionPadding={12} className="color-filter-panel" aria-label={t("颜色筛选选项")}>
      <Input aria-label={t("搜索筛选颜色")} placeholder={t("搜索颜色名称或色值")} value={query} onChange={event => setQuery(event.target.value)}/>
      <div className="color-candidates" tabIndex={0} aria-label={t("当前衣橱已用颜色")}><ColorOptions colors={visible} selected={selected} onChoose={color => { const key = colorKey(color); onChange(selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key]); }}/>{!visible.length && <p>{colors.length ? t("没有匹配的颜色") : t("当前衣橱还没有填写颜色")}</p>}</div>
      <div className="color-filter-footer"><span>{t("匹配任意已选颜色")}</span><Button type="button" variant="ghost" disabled={!selected.length} onClick={() => onChange([])}>{t("清空颜色筛选")}</Button></div>
    </PopoverContent>
  </Popover>;
}
