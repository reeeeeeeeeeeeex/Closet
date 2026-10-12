"use client";
import { useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronRight, Database, Lightbulb, Plus, Ruler, Search, Shirt, SlidersHorizontal, UserRound, X, PanelsTopLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n/provider";
import "./android-shell.css";

export type ClosetView = "personalSizes" | "wardrobe" | "outfits" | "calendar" | "backup" | "assistant" | "account";
export function AndroidOptionalSection({ enabled, title, children }: { enabled: boolean; title: string; children: ReactNode }) {
  return enabled ? <details className="android-optional-section"><summary>{title}<ChevronRight size={18}/></summary><div>{children}</div></details> : <>{children}</>;
}
export function AndroidHeader({ title, subtitle, profileMenu, status, secondary, onBack }: {
  title: string; subtitle?: string; profileMenu: ReactNode; status: ReactNode; secondary: boolean; onBack: () => void;
}) {
  const { t } = useI18n();
  return <header className="topbar android-topbar">
    <div className="android-brand-row"><span className="android-wordmark">NEW CLOSET</span><div className="android-account-trigger">{profileMenu}</div></div>
    <div className="android-page-heading">{secondary && <button className="android-back" type="button" aria-label={t("返回我的")} onClick={onBack}><ArrowLeft size={22}/></button>}<h1>{title}</h1></div>
    {subtitle && <p className="android-subtitle">{subtitle}</p>}
    <div className="android-status-accessible">{status}</div>
  </header>;
}

export function AndroidNavigation({ view, onView, disabled, onAdd }: {
  view: ClosetView; onView: (view: ClosetView) => void; disabled: boolean; onAdd?: () => void;
}) {
  const { t } = useI18n();
  const active = ["wardrobe", "outfits", "calendar"].includes(view) ? view : "account";
  const tabs = [{ id: "wardrobe", label: t("衣橱"), icon: PanelsTopLeft }, { id: "outfits", label: t("搭配"), icon: Shirt }, { id: "calendar", label: t("日历"), icon: CalendarDays }, { id: "account", label: t("我的"), icon: UserRound }] as const;
  return <>{onAdd && <button className="android-add" type="button" aria-label={view === 'outfits' ? t("新建搭配") : t("添加单品")} disabled={disabled} onClick={onAdd}><Plus size={28}/></button>}
    <nav className="android-bottom-nav" aria-label={t("主导航")}>{tabs.map(tab => <button type="button" key={tab.id} disabled={disabled} aria-current={active === tab.id ? 'page' : undefined} onClick={() => onView(tab.id)}><tab.icon size={23} strokeWidth={1.6}/><span>{tab.label}</span><i aria-hidden="true"/></button>)}</nav>
  </>;
}

export function AndroidSearch({ value, onChange, placeholder, count, onReset, children }: {
  value: string; onChange: (value: string) => void; placeholder: string; count: number; onReset: () => void; children: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <div className="android-search-row"><div className="android-search-input"><Search size={19}/><Input aria-label={t("搜索")} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>{value && <button type="button" aria-label={t("清空搜索")} onClick={() => onChange('')}><X size={16}/></button>}</div>
    <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button className={`android-filter-trigger ${count ? 'has-filters' : ''}`} type="button" aria-label={t("筛选与分组")}><SlidersHorizontal size={21}/>{count > 0 && <i>{count}</i>}</button></SheetTrigger>
      <SheetContent side="bottom" className="android-filter-sheet"><SheetHeader><SheetTitle>{t("筛选与分组")}</SheetTitle><SheetDescription>{t("按颜色、场合或分组找到想穿的衣服")}</SheetDescription></SheetHeader><div className="android-filter-options">{children}</div><div className="android-filter-footer"><button type="button" onClick={onReset}>{t("清空筛选")}</button><button type="button" className="android-primary" onClick={() => setOpen(false)}>{t("完成")}</button></div></SheetContent>
    </Sheet>
  </div>;
}

export function AndroidAccount({ profileMenu, status, onView }: { profileMenu: ReactNode; status: ReactNode; onView: (view: ClosetView) => void }) {
  const { t } = useI18n();
  const rows = [{ id: 'personalSizes', title: t('我的尺码'), description: t('记录适合自己的尺寸'), icon: Ruler }, { id: 'backup', title: t('数据与备份'), description: t('备份、恢复与局域网同步'), icon: Database }, { id: 'assistant', title: t('穿搭灵感'), description: t('从衣橱里寻找新组合'), icon: Lightbulb }] as const;
  return <div className="android-my"><section className="android-my-profile">{profileMenu}<div className="android-my-status"><Check size={14}/>{status}</div></section><div className="android-my-links">{rows.map(row => <button type="button" key={row.id} onClick={() => onView(row.id)}><row.icon size={25} strokeWidth={1.4}/><span><strong>{row.title}</strong><small>{row.description}</small></span><ChevronRight size={19}/></button>)}</div></div>;
}
