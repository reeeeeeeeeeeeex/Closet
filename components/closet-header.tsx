"use client";
import type { ReactNode } from "react";
import { Cloud, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

export function ClosetHeader({ menu, stats, error, loading, syncing, synced, onAdd, onRefresh }: {
  menu: ReactNode; stats?: { items: number; outfits: number; worn: number };
  error: boolean; loading: boolean; syncing: boolean; synced: string;
  onAdd: () => void; onRefresh: () => void;
}) {
  const { t } = useI18n();
  return <header className={`topbar ${stats ? "has-wardrobe-stats" : ""}`}>
    <div className="topbar-menu">{menu}</div>
    {stats && <div className="stats-summary" aria-label={t("衣橱统计")}><span>{t("单品")} <strong>{stats.items}</strong></span><i aria-hidden="true">·</i><span>{t("搭配")} <strong>{stats.outfits}</strong></span><i aria-hidden="true">·</i><span>{t("已穿")} <strong>{stats.worn}</strong></span></div>}
    <div className="topbar-right"><span className={`sync-label ${error ? "sync-error" : ""}`}><Cloud size={15}/>{error ? t("连接待恢复") : loading ? t("正在连接") : t("已同步 {value1}", { value1: synced })}</span><Button variant="ghost" size="icon" aria-label={t("刷新衣橱")} onClick={onRefresh} disabled={syncing}><RefreshCw size={16} className={syncing ? "animate-spin" : ""}/></Button>{stats && <Button className="main-action" disabled={error} onClick={onAdd}><Plus size={18}/>{t("添加单品")}</Button>}</div>
  </header>;
}
