"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/provider";
import { brandKey } from "@/lib/brands";

export function BrandField({ value, brands, onChange }: { value: string; brands: string[]; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const options = brands.filter(brand => brandKey(brand).includes(brandKey(query)));
  const expanded = open && options.length > 0;
  useEffect(() => {
    if (expanded && active >= 0) list.current?.children.item(active)?.scrollIntoView({ block: "nearest" });
  }, [active, expanded]);
  function choose(brand: string) {
    onChange(brand);
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  }
  return <div className="field brand-field" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <Label htmlFor={`${id}-brand`}>{t("品牌")}</Label>
    <div className="brand-combobox">
      <Input ref={input} id={`${id}-brand`} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-brands` : undefined} aria-activedescendant={expanded && active >= 0 ? `${id}-brand-${active}` : undefined} autoComplete="off" maxLength={100} value={value} placeholder={t("输入品牌或选择已填品牌")} onFocus={() => { setQuery(""); setActive(-1); setOpen(true); }} onClick={() => { if (!open) { setQuery(""); setActive(-1); setOpen(true); } }} onChange={event => { onChange(event.target.value); setQuery(event.target.value); setActive(-1); setOpen(true); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length) {
          event.preventDefault(); setOpen(true);
          setActive(index => event.key === "ArrowDown" ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1));
        }
        if (event.key === "Enter" && expanded && active >= 0 && active < options.length) { event.preventDefault(); choose(options[active]); }
      }}/>
      {expanded && <div ref={list} className="brand-options" id={`${id}-brands`} role="listbox" aria-label={t("已填写的品牌")}>{options.map((brand, index) => <button type="button" tabIndex={-1} key={brand} id={`${id}-brand-${index}`} role="option" aria-selected={brandKey(value) === brandKey(brand)} className={active === index ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => choose(brand)}>{brand}</button>)}</div>}
    </div>
    <p className="field-hint">{t("可留空；点击选择已填品牌，也可输入新品牌。")}</p>
  </div>;
}
