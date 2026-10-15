"use client";
import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";
import { COMMON_COLORS, colorKey, isCommonColor, draftColorStyle, changeColorMode, type ColorDraft, type ColorValue } from "@/lib/colors";

export function ColorSwatch({ color }: { color: ColorValue }) {
  return <span className={`color-swatch ${color.hex ? "" : "unfilled"}`} style={color.hex ? { backgroundColor: color.hex } : undefined} aria-hidden="true"/>;
}
export function ColorName({ color }: { color: ColorValue }) {
  const { t } = useI18n();
  return <>{isCommonColor(color) ? t(color.name) : color.name}</>;
}
export function ColorOptions({ colors, selected = [], onChoose }: { colors: ColorValue[]; selected?: string[]; onChoose: (color: ColorValue) => void }) {
  return <div className="color-options">{colors.map(color => <button type="button" className="color-chip" key={colorKey(color)} title={color.hex || color.name} aria-pressed={selected.includes(colorKey(color))} onClick={() => onChoose(color)}><ColorSwatch color={color}/><ColorName color={color}/>{color.hex && <span className="sr-only"> {color.hex}</span>}</button>)}</div>;
}
export function ColorField({ draft, onChange, library, sampling }: {
  draft: ColorDraft; onChange: (draft: ColorDraft) => void; library: ColorValue[];
  sampling?: (onSample: (hex: string) => void) => ReactNode;
}) {
  const { t } = useI18n();
  const [target, setTarget] = useState<"main" | "add" | null>(null);
  const [query, setQuery] = useState("");
  const [hex, setHex] = useState<string | null>(null);
  const style = draftColorStyle(draft);
  const main = style.values[0];
  const selected = draft.all.map(colorKey);
  const matches = (color: ColorValue) => [color.name, isCommonColor(color) ? t(color.name) : "", color.hex || ""].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const customName = query.trim() || hex || "";
  function choose(color: ColorValue) {
    const key = colorKey(color);
    let all = draft.all;
    if (target === "main" && draft.primaryKey !== key) all = all.filter(value => colorKey(value) !== draft.primaryKey);
    if (!all.some(value => colorKey(value) === key)) all = [...all, color];
    onChange({ ...draft, all, primaryKey: target === "main" || !draft.primaryKey ? key : draft.primaryKey, needsChoice: false });
    setQuery(""); setHex(null);
    if (target === "main") setTarget(null);
  }
  function remove(color: ColorValue) {
    const all = draft.all.filter(value => colorKey(value) !== colorKey(color));
    onChange({ ...draft, all, primaryKey: draft.primaryKey === colorKey(color) ? all[0] ? colorKey(all[0]) : null : draft.primaryKey, needsChoice: false });
  }
  function chips(colors: ColorValue[]) {
    return colors.map(color => <span className="color-chip selected" key={colorKey(color)} title={color.hex || color.name}><ColorSwatch color={color}/><ColorName color={color}/><button type="button" aria-label={t("移除颜色 {name}", { name: isCommonColor(color) ? t(color.name) : color.name })} onClick={() => remove(color)}><X size={14}/></button></span>);
  }
  return <section className="color-field" aria-label={t("颜色（选填）")}>
    <strong>{t("颜色（选填）")}</strong>
    <div className="color-modes" role="group" aria-label={t("颜色模式")}>{([['solid', t("纯色")], ['primary', t("主色＋辅色")], ['colorblock', t("拼色")]] as const).map(([mode, label]) => <button type="button" key={mode} aria-pressed={draft.mode === mode} onClick={() => { onChange(changeColorMode(draft, mode)); setTarget(null); }}>{label}</button>)}</div>
    {draft.needsChoice ? <div className="color-choice"><p>{draft.mode === "solid" ? t("选择要保留的颜色；切回其他模式可恢复其余颜色。") : t("请选择主色，其余颜色作为辅色。")}</p><ColorOptions colors={draft.all} onChoose={color => onChange({ ...draft, primaryKey: colorKey(color), needsChoice: false })}/></div> : <>
      {draft.mode !== "colorblock" && <div className="color-role"><span>{draft.mode === "primary" ? t("主色") : t("颜色")}</span><div className="color-selected">{main && chips([main])}<Button type="button" variant="outline" onClick={() => setTarget(target === "main" ? null : "main")}>{main ? t("更换") : t("选择颜色")}</Button></div></div>}
      {draft.mode !== "solid" && <div className="color-role"><span>{draft.mode === "primary" ? t("辅色") : t("拼色颜色")}</span><div className="color-selected">{chips(draft.mode === "primary" ? style.values.slice(1) : style.values)}<Button type="button" variant="outline" onClick={() => setTarget(target === "add" ? null : "add")}><Plus size={14}/>{draft.mode === "primary" ? t("添加辅色") : t("添加颜色")}</Button></div></div>}
      {draft.mode === "colorblock" && <p className="field-hint">{t("各颜色并列，不区分主次；请至少选择两种颜色。")}</p>}
      {draft.mode === "solid" && draft.all.length > 1 && <p className="field-hint">{t("其余 {count} 种颜色暂存在草稿中，切换模式可恢复。", { count: draft.all.length - 1 })}</p>}
    </>}
    {target && !draft.needsChoice && <div className="color-picker-panel">
      <Input aria-label={t("输入或搜索颜色")} maxLength={50} placeholder={t("输入或搜索颜色")} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (customName) choose({ name: customName, hex }); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTarget(null); } }}/>
      <div className="color-create"><label className="color-manual">{t("自定义色块")}<input aria-label={t("选择色块")} type="color" value={hex || "#889eb6"} onChange={event => setHex(event.target.value)}/></label>{hex && <Button type="button" variant="ghost" onClick={() => setHex(null)}>{t("清除色块")}</Button>}{sampling?.(setHex)}</div>
      {customName && <Button type="button" variant="outline" className="color-use-new" onClick={() => choose({ name: customName, hex })}><ColorSwatch color={{ name: customName, hex }}/>{t("使用颜色「{name}」", { name: customName })}</Button>}
      <div className="color-candidates" tabIndex={0} aria-label={t("可选颜色")}>
        <p>{t("常见颜色")}</p><ColorOptions colors={COMMON_COLORS.filter(matches)} selected={selected} onChoose={choose}/>
        {!!library.length && <><p>{t("我的颜色")}</p><ColorOptions colors={library.filter(matches)} selected={selected} onChoose={choose}/></>}
        {!COMMON_COLORS.some(matches) && !library.some(matches) && <p>{t("没有匹配颜色，可以使用上方名称添加。")}</p>}
      </div>
      <p className="field-hint">{t("保存单品后，新增颜色可在本账号的所有衣橱中使用。")}</p>
    </div>}
  </section>;
}

export function ColorDetails({ style }: { style: import("@/lib/colors").ColorStyle }) {
  const { t } = useI18n();
  return <div className="color-selected">{style.values.map((color, index) => <span className="color-chip" key={colorKey(color)} title={color.hex || color.name}><ColorSwatch color={color}/>{style.mode === "primary" ? index === 0 ? t("主色") + " · " : t("辅色") + " · " : ""}<ColorName color={color}/></span>)}</div>;
}
