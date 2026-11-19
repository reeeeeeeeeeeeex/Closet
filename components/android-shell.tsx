"use client";
import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Database, Lightbulb, Plus, Ruler, Search, Shirt, SlidersHorizontal, UserRound, X, PanelsTopLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n/provider";
import { LanguageSelect } from "@/components/language-select";
import "./android-shell.css";

export type ClosetView = "personalSizes" | "wardrobe" | "outfits" | "calendar" | "backup" | "assistant" | "account";
export function AndroidOptionalSection({ enabled, title, children }: { enabled: boolean; title: string; children: ReactNode }) {
  return enabled ? <details className="android-optional-section"><summary>{title}<ChevronRight size={18}/></summary><div>{children}</div></details> : <>{children}</>;
}
export function AndroidHeader({ title, status, secondary, onBack, action }: {
  title: string; status: ReactNode; secondary: boolean; onBack: () => void;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const { t } = useI18n();
  return <header className={`topbar android-topbar ${secondary ? "is-secondary" : "is-primary"}`}>
    <div className="android-page-heading">
      {secondary && <button className="android-back" type="button" aria-label={t("返回我的")} onClick={onBack}><ChevronLeft size={24} strokeWidth={2.2}/></button>}
      <h1>{title}</h1>
      {action && <button className="android-header-add" type="button" aria-label={action.label} disabled={action.disabled} onClick={action.onClick}><Plus size={19} strokeWidth={2.2}/></button>}
    </div>
    <div className="android-status-accessible">{status}</div>
  </header>;
}

export function AndroidNavigation({ view, onView, disabled }: {
  view: ClosetView; onView: (view: ClosetView) => void; disabled: boolean;
}) {
  const { t } = useI18n();
  const active = ["wardrobe", "outfits", "calendar"].includes(view) ? view : "account";
  const tabs = [{ id: "wardrobe", label: t("衣橱"), icon: PanelsTopLeft }, { id: "outfits", label: t("搭配"), icon: Shirt }, { id: "calendar", label: t("日历"), icon: CalendarDays }, { id: "account", label: t("我的"), icon: UserRound }] as const;
  return <nav className="android-bottom-nav" aria-label={t("主导航")}>{tabs.map(tab => {
    const selected = active === tab.id;
    return <button type="button" key={tab.id} disabled={disabled} aria-current={selected ? "page" : undefined} onClick={() => onView(tab.id)}>
      <tab.icon size={22} strokeWidth={selected ? 2.1 : 1.6}/><span>{tab.label}</span>
    </button>;
  })}</nav>;
}

export function AndroidSearch({ value, onChange, placeholder, count, onReset, children }: {
  value: string; onChange: (value: string) => void; placeholder: string; count: number; onReset: () => void; children: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <div className="android-search-row"><div className="android-search-input"><Search size={17}/><Input aria-label={t("搜索")} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>{value && <button type="button" aria-label={t("清空搜索")} onClick={() => onChange('')}><X size={15}/></button>}</div>
    <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button className={`android-filter-trigger ${count ? 'has-filters' : ''}`} type="button" aria-label={t("筛选与分组")}><SlidersHorizontal size={18}/>{count > 0 && <i>{count}</i>}</button></SheetTrigger>
      <SheetContent side="bottom" className="android-filter-sheet"><SheetHeader><SheetTitle>{t("筛选与分组")}</SheetTitle><SheetDescription className="sr-only">{t("按颜色、场合或分组找到想穿的衣服")}</SheetDescription></SheetHeader><div className="android-filter-options">{children}</div><div className="android-filter-footer"><button type="button" className="android-secondary" onClick={onReset}>{t("清空筛选")}</button><button type="button" className="android-primary" onClick={() => setOpen(false)}>{t("完成")}</button></div></SheetContent>
    </Sheet>
  </div>;
}

export function AndroidAccount({ profileMenu, status, onView }: { profileMenu: ReactNode; status: ReactNode; onView: (view: ClosetView) => void }) {
  const { t } = useI18n();
  const rows = [
    { id: "personalSizes", title: t("我的尺码"), icon: Ruler, tone: "blue" },
    { id: "backup", title: t("数据与备份"), icon: Database, tone: "green" },
    { id: "assistant", title: t("穿搭灵感"), icon: Lightbulb, tone: "amber" },
  ] as const;
  return <div className="android-my">
    <section className="android-my-card android-my-profile">{profileMenu}<div className="android-my-status">{status}</div></section>
    <div className="android-my-card android-my-links">{rows.map(row => <button type="button" key={row.id} onClick={() => onView(row.id)}>
      <span className={`android-my-icon tone-${row.tone}`} aria-hidden="true"><row.icon size={17} strokeWidth={1.8}/></span>
      <span className="android-my-title"><strong>{row.title}</strong></span>
      <ChevronRight size={17} className="android-my-chevron"/>
    </button>)}</div>
    <section className="android-my-card android-my-lang"><LanguageSelect/></section>
  </div>;
}
