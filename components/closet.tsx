/* eslint-disable @next/next/no-img-element -- Authenticated originals and temporary blob previews bypass the image proxy. */
"use client";
import { tr, translatedOptions } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n/provider";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shirt, Layers3, CalendarDays, Database, Sparkles, Plus, Search, ArrowUpRight, ArrowRight, RefreshCw, Download, Upload, Check, X, ImagePlus, Archive, ChevronLeft, ChevronRight, ChevronDown, Cloud, LockKeyhole, Copy, Loader2, Camera, AlertCircle, CheckCircle2, PackageOpen, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { CATEGORIES, OCCASIONS, SEASONS, wardrobePrompt, type Item, type ItemRecord, type Outfit, type OutfitRecord, type CalendarRecord, type ClosetState, type ClosetRecord, type ClosetArchive, type Subset, type SubsetRecord } from "@/lib/domain";
import { SubsetBrowser } from "@/components/subsets";
import { subsetMemberIds } from "@/lib/subsets";
import { ItemDetailsFields, ItemLabels } from "@/components/item-details";
import { CATEGORY_MEASUREMENTS, garmentCategory } from "@/lib/item-details";
import { OutfitFields } from "@/components/outfit-fields";
import { dayInMonth } from "@/lib/calendar";
import { ApiClientError, api, uploadAsset, exportArchive, inspectArchive, importArchive, downloadBlob } from "@/lib/portable";
const blankItem: Item = { name: "", category: "top", color: "", seasons: [], occasions: [], notes: "", asset: null, archived: false, fit: null, shoeFit: null, shoeSize: { eu: null, cn: null }, measurements: {} };
const blankOutfit: Outfit = { name: "", itemIds: [], asset: null, occasions: [], notes: "", archived: false };
const errorMessage = (e: unknown) => e instanceof Error ? tr(e.message) : tr("操作失败，请重试");
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
type View = "wardrobe" | "outfits" | "calendar" | "backup" | "assistant";
type Editor = {
    kind: "item";
    record?: ItemRecord;
    initialCategory?: Item["category"];
} | {
    kind: "outfit";
    record?: OutfitRecord;
} | {
    kind: "calendar";
    record?: CalendarRecord;
    outfitId?: string;
    date?: string;
};
type Save = (kind: ClosetRecord["kind"], data: unknown, record?: ClosetRecord) => Promise<void>;
function Photo({ asset, name, className = "" }: {
    asset: string | null;
    name: string;
    className?: string;
}) {
    const { t } = useI18n();
    return <div className={`photo ${className}`}>{asset ? <img src={`/api/assets/${asset}`} alt={name} loading="lazy" onError={e => { e.currentTarget.style.opacity = ".2"; }}/> : <div className="photo-placeholder"><Shirt strokeWidth={1}/><span>{t("未添加照片")}</span></div>}</div>;
}
function Chips<T extends string>({ options, value, onChange }: {
    options: Record<T, string>;
    value: T[];
    onChange: (v: T[]) => void;
}) {
    const { t } = useI18n();
    return <div className="chip-row">{(Object.entries(options) as [
        T,
        string
    ][]).map(([id, label]) => <button type="button" className={`chip ${value.includes(id) ? "selected" : ""}`} key={id} aria-pressed={value.includes(id)} onClick={() => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])}>{t(label)}</button>)}</div>;
}
function Picker({ value, onChange, options, label }: {
    value: string;
    onChange: (value: string) => void;
    options: Record<string, string>;
    label: string;
}) {
    return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-full" aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{Object.entries(options).map(([key, name]) => <SelectItem key={key} value={key}>{name}</SelectItem>)}</SelectContent></Select>;
}
function OccasionLabels({ values }: {
    values: Item["occasions"];
}) { const { t } = useI18n(); return <div className="occasion-labels">{values.map(o => <span key={o}>{t(OCCASIONS[o])}</span>)}</div>; }
function Navigation({ view, onView, state }: {
    view: View;
    onView: (v: View) => void;
    state: ClosetState | null;
}) {
    const { t } = useI18n();
    const { setOpenMobile } = useSidebar();
    const entries: {
        id: View;
        name: string;
        icon: typeof Shirt;
        count?: number;
    }[] = [
        { id: "wardrobe", name: t("我的衣橱"), icon: Shirt, count: state?.records.filter(r => r.kind === "item" && !r.data.archived).length },
        { id: "outfits", name: t("搭配集"), icon: Layers3, count: state?.records.filter(r => r.kind === "outfit" && !r.data.archived).length },
        { id: "calendar", name: t("穿搭日历"), icon: CalendarDays },
    ];
    const go = (v: View) => { onView(v); setOpenMobile(false); };
    return <Sidebar className="closet-sidebar"><SidebarHeader className="brand-header"><button onClick={() => go("wardrobe")} className="brand" aria-label={t("New Closet 首页")}><div className="brand-icon"><Shirt size={22} strokeWidth={1.6}/></div><div><strong>{t("new closet")}<span>•</span></strong><small>{t("衣橱，由你定义")}</small></div></button></SidebarHeader>
    <SidebarContent className="px-5"><div className="nav-caption">{t("我的空间")}</div><SidebarMenu>{entries.map(e => <SidebarMenuItem key={e.id}><SidebarMenuButton isActive={view === e.id} onClick={() => go(e.id)} className="nav-button"><e.icon size={19} strokeWidth={1.7}/><span>{e.name}</span>{e.count !== undefined && <span className="nav-count">{e.count}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
    <div className="nav-caption mt-8">{t("更多可能")}</div><SidebarMenu>{[{ id: "assistant" as View, name: t("AI 穿搭灵感"), icon: Sparkles }, { id: "backup" as View, name: t("数据与备份"), icon: Database }].map(e => <SidebarMenuItem key={e.id}><SidebarMenuButton isActive={view === e.id} onClick={() => go(e.id)} className="nav-button"><e.icon size={19} strokeWidth={1.7}/><span>{e.name}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
    <div className="ownership-note"><PackageOpen size={24} strokeWidth={1.3}/><h3>{t("好好穿，也能随时带走。")}</h3><p>{t("照片、搭配、穿着记录，都属于你。")}</p><button onClick={() => go("backup")}>{t("了解完整备份")}<ArrowUpRight size={15}/></button></div></SidebarContent>
    <SidebarFooter className="profile-footer"><div className="profile-mark">{t("N")}</div><div><strong>{t("私人衣橱")}</strong><span><LockKeyhole size={11}/>{t("仅自己可见")}</span></div><span className="version-mark">{t("V 0.1")}</span></SidebarFooter></Sidebar>;
}
export default function Home() {
    const { t, locale } = useI18n();
    const router = useRouter();
    const [state, setState] = useState<ClosetState | null>(null);
    const [view, setView] = useState<View>("wardrobe");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [authRequired, setAuthRequired] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [synced, setSynced] = useState("");
    const [editor, setEditor] = useState<Editor | null>(null);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [selectedSubsetId, setSelectedSubsetId] = useState<string | null>(null);
    const [occasion, setOccasion] = useState("all");
    const [archived, setArchived] = useState(false);
    const selectedCollection = useRef<string | undefined>(undefined);
    const refreshId = useRef(0);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    const refresh = useCallback(async (collectionId?: string, silent = false) => {
        const id = ++refreshId.current;
        if (collectionId) {
            if (selectedCollection.current !== collectionId) setSelectedSubsetId(null);
            selectedCollection.current = collectionId;
        }
        if (!silent)
            setSyncing(true);
        try {
            const next = await api<ClosetState>(`/api/closet${selectedCollection.current ? `?collection=${encodeURIComponent(selectedCollection.current)}` : ""}`);
            if (id !== refreshId.current)
                return;
            selectedCollection.current = next.collectionId;
            setState(next);
            setError("");
            setAuthRequired(false);
            setSynced(new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }));
        }
        catch (e) {
            if (id === refreshId.current) {
                setError(errorMessage(e)); setAuthRequired(e instanceof ApiClientError && e.status === 401);
            }
        }
        finally {
            if (id === refreshId.current) {
                setLoading(false);
                setSyncing(false);
            }
        }
    }, [locale]);
    // Start the initial request asynchronously; refresh also serves event handlers.
    useEffect(() => { void Promise.resolve().then(() => refresh()); }, [refresh]);
    useEffect(() => { if (editor)
        return; const onFocus = () => { if (document.visibilityState === "visible")
        void refresh(undefined, true); }; window.addEventListener("focus", onFocus); const interval = setInterval(onFocus, 45000); return () => { window.removeEventListener("focus", onFocus); clearInterval(interval); }; }, [editor, refresh]);
    const save: Save = async (kind, data, record) => {
        const subsetId = !record && activeSubset?.data.scope === kind ? activeSubset.id : undefined;
        await api("/api/closet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save", collectionId: selectedCollection.current || "main", kind, data, id: record?.id, version: record?.version, subsetId }) });
        setEditor(null);
        toast.success(t("已保存到衣橱"));
        await refresh();
    };
    const saveSubset = async (data: Subset, record?: SubsetRecord) => {
        const result = await api<{ id: string }>("/api/closet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save", collectionId: selectedCollection.current || "main", kind: "subset", data, id: record?.id, version: record?.version }) });
        toast.success(t("子集已保存")); await refresh(); return result.id;
    };
    const removeCalendar = async (record: CalendarRecord) => { await api("/api/closet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "deleteCalendar", collectionId: selectedCollection.current || "main", kind: "calendar", id: record.id, version: record.version }) }); setEditor(null); toast.success(t("日历记录已删除")); await refresh(); };
    const items = useMemo(() => (state?.records || []).filter((r): r is ItemRecord => r.kind === "item"), [state]);
    const outfits = useMemo(() => (state?.records || []).filter((r): r is OutfitRecord => r.kind === "outfit"), [state]);
    const calendar = useMemo(() => (state?.records || []).filter((r): r is CalendarRecord => r.kind === "calendar"), [state]);
    const activeItems = items.filter(i => !i.data.archived);
    const activeOutfits = outfits.filter(o => !o.data.archived);
    const scope = view === "wardrobe" ? "item" : "outfit";
    const subsetRoot = view === "wardrobe" ? category as Subset["root"] : "all";
    const activeSubset = state?.records.find((record): record is SubsetRecord => record.kind === "subset" && record.id === selectedSubsetId && record.data.scope === scope && record.data.root === subsetRoot);
    const subsetMembers = activeSubset ? subsetMemberIds(state!.records, activeSubset.id) : null;
    const filteredItems = items.filter(i => (!subsetMembers || subsetMembers.has(i.id)) && i.data.archived === archived && (category === "all" || i.data.category === category) && (occasion === "all" || i.data.occasions.includes(occasion as Item["occasions"][number])) && [i.data.name, i.data.color, i.data.notes].join(" ").toLowerCase().includes(search.toLowerCase()));
    const filteredOutfits = outfits.filter(o => (!subsetMembers || subsetMembers.has(o.id)) && o.data.archived === archived && (occasion === "all" || o.data.occasions.includes(occasion as Item["occasions"][number])) && [o.data.name, o.data.notes].join(" ").toLowerCase().includes(search.toLowerCase()));
    const goView = (v: View) => { setView(v); setSearch(""); setCategory("all"); setSelectedSubsetId(null); setOccasion("all"); setArchived(false); };
    useEffect(() => {
        const mc = (document as Document & {
            modelContext?: {
                registerTool: (tool: unknown, options: {
                    signal: AbortSignal;
                }) => void | Promise<void>;
            };
        }).modelContext;
        if (!mc?.registerTool)
            return;
        const controller = new AbortController();
        const validate = (input: unknown) => { if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)
            throw new Error(t("Expected an empty input object")); };
        const register = (tool: unknown) => { try {
            void Promise.resolve(mc.registerTool(tool, { signal: controller.signal })).catch(() => { });
        }
        catch { } };
        register({ name: "closet_read", description: "Read the currently selected personal wardrobe, including items, outfits and calendar. No changes are made.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => { validate(input); if (!stateRef.current)
                throw new Error(t("Wardrobe is not loaded")); return stateRef.current; } });
        register({ name: "closet_start_item", description: "Open the Add item form for the user to review and save. Does not save automatically.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input: unknown) => { validate(input); if (controller.signal.aborted || !stateRef.current)
                throw new Error(t("Wardrobe is not available")); setEditor({ kind: "item" }); return { status: "form_opened", saved: false }; } });
        return () => controller.abort();
    }, [t]);
    const titles = { wardrobe: t("我的衣橱"), outfits: t("搭配集"), calendar: t("穿搭日历"), backup: t("数据与备份"), assistant: t("AI 穿搭灵感") };
    return <SidebarProvider style={{ "--sidebar-width": "248px" } as React.CSSProperties}><Navigation view={view} onView={goView} state={state}/><SidebarInset className="main-inset"><header className="topbar"><div className="flex items-center gap-3"><SidebarTrigger className="md:hidden"/><span className="breadcrumb">{t("我的空间")}<span>/</span> <strong>{titles[view]}</strong></span></div><div className="topbar-right"><span className={`sync-label ${error ? "sync-error" : ""}`}><Cloud size={15}/> {error ? t("连接待恢复") : loading ? t("正在连接") : t("已同步 {value1}", { value1: synced })}</span><Button variant="ghost" size="icon" aria-label={t("刷新衣橱")} onClick={() => void refresh()} disabled={syncing}><RefreshCw size={16} className={syncing ? "animate-spin" : ""}/></Button><Button variant="ghost" onClick={async () => { try {
        await api("/api/auth", { method: "DELETE" });
        router.replace("/login");
        router.refresh();
    }
    catch (e) {
        toast.error(errorMessage(e));
    } }}>{t("退出")}</Button></div></header>
    <main className="workspace">
      {state && state.collections.length > 1 && <div className="collection-switch"><span>{t("当前衣橱")}</span><Picker label={t("切换衣橱")} value={state.collectionId} options={Object.fromEntries(state.collections.map(c => [c.id, c.name]))} onChange={v => void refresh(v)}/></div>}
      <div className="page-heading"><div><div className="eyebrow">{view === "wardrobe" ? t("YOUR PERSONAL WARDROBE") : view === "outfits" ? t("A LITTLE INSPIRATION, EVERY DAY") : view === "calendar" ? t("DRESS FOR YOUR DAYS") : view === "backup" ? t("YOUR WARDROBE, YOUR DATA") : t("MAKE ROOM FOR IDEAS")}</div><h1>{titles[view]}<span className="heading-period">.</span></h1><p>{view === "wardrobe" ? t("收好每一件喜欢，把灵感穿进日常。") : view === "outfits" ? t("从熟悉的单品里，发现新的组合。") : view === "calendar" ? t("安排未来的穿搭，留住当天的样子。") : view === "backup" ? t("带上原图和每一条记录，自由迁移。") : t("让你常用的 AI，先认识你的衣橱。")}</p></div>
      {(view === "wardrobe" || view === "outfits" || view === "calendar") && <Button className="main-action" disabled={!state || !!error} onClick={() => setEditor(view === "wardrobe" ? { kind: "item", initialCategory: category === "all" ? "top" : category as Item["category"] } : view === "outfits" ? { kind: "outfit" } : { kind: "calendar", date: localDate() })}><Plus size={18}/>{view === "wardrobe" ? t("添加单品") : view === "outfits" ? t("新建搭配") : t("添加穿搭")}</Button>}</div>
      {error && <div className="error-banner" role="alert"><AlertCircle size={19}/><div><strong>{t("暂时无法同步衣橱")}</strong><p>{error}</p>{authRequired && <a href="/login">{t("登录后继续")}</a>}</div><Button variant="outline" onClick={() => void refresh()}>{t("重试")}</Button></div>}
      {loading ? <div className="loading-grid">{[1, 2, 3, 4].map(n => <Skeleton key={n} className="h-72 rounded-2xl"/>)}</div> : state && <>
        {view === "wardrobe" && <><div className="stats-strip"><Stat label={t("衣橱单品")} count={activeItems.length} suffix={t("件")}/><Stat label={t("收藏搭配")} count={activeOutfits.length} suffix={t("套")}/><Stat label={t("已穿记录")} count={calendar.filter(c => c.data.status === "worn").length} suffix={t("次")}/><div className="stats-note"><span className="tiny-dot"/>{t("从已有的喜欢，穿出更多可能")}</div></div><div className="wardrobe-toolbar"><div className="category-tabs" role="group" aria-label={t("单品分类")}>{Object.entries({ all: t("全部"), ...translatedOptions(CATEGORIES, t) }).map(([key, label]) => <button key={key} onClick={() => { setCategory(key); setSelectedSubsetId(null); }} className={category === key ? "active" : ""}>{label}<span>{key === "all" ? items.filter(i => i.data.archived === archived).length : items.filter(i => i.data.category === key && i.data.archived === archived).length}</span></button>)}</div></div></>}
        {(view === "wardrobe" || view === "outfits") && <><SubsetBrowser records={state.records} scope={scope} root={subsetRoot} activeId={activeSubset?.id || null} archived={archived} disabled={!!error || syncing} onSelect={setSelectedSubsetId} onSave={saveSubset} /><div className="filter-row"><div className="search-box"><Search size={17}/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder={view === "wardrobe" ? t("找一件单品、颜色或备注\u2026") : t("寻找我的搭配\u2026")} aria-label={t("搜索")}/>{search && <button aria-label={t("清空搜索")} onClick={() => setSearch("")}><X size={14}/></button>}</div><div className="filter-controls"><Picker label={t("场合筛选")} value={occasion} onChange={setOccasion} options={{ all: t("所有场合"), ...translatedOptions(OCCASIONS, t) }}/><button className={`archive-filter ${archived ? "on" : ""}`} aria-pressed={archived} onClick={() => setArchived(!archived)} title={t("查看已收起的单品或搭配")}><Archive size={16}/><span>{t("已收起")}</span></button></div></div>
        {view === "wardrobe" && (filteredItems.length ? <div className="item-grid">{filteredItems.map(item => <button className="item-card" key={item.id} onClick={() => setEditor({ kind: "item", record: item })}><Photo asset={item.data.asset} name={item.data.name}/><div className="item-card-body"><div className="item-category">{t(CATEGORIES[item.data.category])}{item.data.color && ` / ${item.data.color}`}</div><h3>{item.data.name}</h3><OccasionLabels values={item.data.occasions}/><ItemLabels item={item.data}/></div><span className="card-edit"><ArrowUpRight size={18}/></span></button>)}</div> : items.length === 0 && !search && category === "all" && occasion === "all" && !archived ? <Welcome onAdd={() => setEditor({ kind: "item" })} onImport={() => goView("backup")}/> : <EmptyState icon={Search} title={activeSubset ? t("这个子集还没有内容") : t("这里还没有单品")} text={activeSubset ? t("编辑子集可加入已有单品，新建单品会自动加入当前子集。") : t("试试其他分类，或清空筛选条件。")} action={activeSubset ? t("添加单品") : t("清空筛选")} onAction={() => { if (activeSubset) setEditor({ kind: "item", initialCategory: category === "all" ? "top" : category as Item["category"] }); else { setSearch(""); setCategory("all"); setSelectedSubsetId(null); setOccasion("all"); setArchived(false); } }}/>)}
        {view === "outfits" && (filteredOutfits.length ? <div className="outfit-grid">{filteredOutfits.map(outfit => <div className="outfit-card" key={outfit.id}><button className="outfit-open" onClick={() => setEditor({ kind: "outfit", record: outfit })}><OutfitCollage asset={outfit.data.asset} itemIds={outfit.data.itemIds} items={items}/><div className="outfit-body"><div className="item-category">{outfit.data.asset ? t("搭配照片 \u00B7 ") : ""}{outfit.data.itemIds.length ? t("{value1} 件单品", { value1: outfit.data.itemIds.length }) : t("未关联单品")}</div><h3>{outfit.data.name}</h3><OccasionLabels values={outfit.data.occasions}/></div></button><div className="outfit-footer"><span>{outfit.data.notes || t("喜欢的组合，留给刚好的日子。")}</span><Button variant="ghost" size="icon" aria-label={t("安排 {value1} 的穿搭日期", { value1: outfit.data.name })} onClick={() => setEditor({ kind: "calendar", outfitId: outfit.id, date: localDate() })}><CalendarDays size={19}/></Button></div></div>)}</div> : <EmptyState icon={Layers3} title={activeSubset ? t("这个子集还没有搭配") : outfits.length ? t("没有找到这个搭配") : t("第一套搭配，从喜欢的单品开始")} text={activeSubset ? t("新建搭配会自动加入当前子集，也可以编辑子集选择已有搭配。") : t("拍照、导入搭配照片，或从单品组合一套穿搭。")} action={t("新建搭配")} onAction={() => setEditor({ kind: "outfit" })}/>)}</>}
        {view === "calendar" && <CalendarPanel entries={calendar} onAdd={date => setEditor({ kind: "calendar", date })} onEdit={record => setEditor({ kind: "calendar", record })}/>}
        {view === "backup" && <BackupPanel state={state} onImported={async (id) => { await refresh(id); goView("wardrobe"); }}/>}
        {view === "assistant" && <AssistantPanel state={state}/>}
      </>}
      <footer className="workspace-footer"><span>{t("NEW CLOSET")}<span className="footer-divider">/</span>{t("少一点纠结，多一点喜欢。")}</span><span><LockKeyhole size={12}/>{t("私人空间")}</span></footer>
    </main></SidebarInset><Toaster theme="light" position="top-center" richColors/>
    {editor?.kind === "item" && <ItemEditor key={editor.record?.id || "new-item"} record={editor.record} initialCategory={editor.initialCategory} onClose={() => setEditor(null)} onSave={save}/>}
    {editor?.kind === "outfit" && <OutfitEditor key={editor.record?.id || "new-outfit"} record={editor.record} items={items} onClose={() => setEditor(null)} onSave={save}/>}
    {editor?.kind === "calendar" && <CalendarEditor key={editor.record?.id || "new-calendar"} record={editor.record} date={editor.date} outfitId={editor.outfitId} outfits={outfits} items={items} onClose={() => setEditor(null)} onSave={save} onDelete={removeCalendar}/>}
  </SidebarProvider>;
}
function Stat({ label, count, suffix }: {
    label: string;
    count: number;
    suffix: string;
}) { return <div className="stat"><span>{label}</span><div>{count.toString().padStart(2, "0")}<small>{suffix}</small></div></div>; }
function Welcome({ onAdd, onImport }: {
    onAdd: () => void;
    onImport: () => void;
}) {
    const { t } = useI18n();
    return <div className="welcome-card"><div className="welcome-copy"><span className="welcome-label"><span className="tiny-dot"/>{t("从一件喜欢的单品开始")}</span><h2>{t("你的衣橱，正在等你打开。")}</h2><p>{t("拍张照，记下它的颜色与场合。让每件喜欢的衣服，都有出场的机会。")}</p><Button size="lg" onClick={onAdd}><Plus size={18}/>{t("添加第一件单品")}<ArrowRight size={17}/></Button><button className="text-link" onClick={onImport}>{t("已有 New Closet 备份？导入衣橱")}<ArrowUpRight size={15}/></button><div className="welcome-checks"><span><Check size={13}/>{t("保留原始照片")}</span><span><Check size={13}/>{t("随时完整导出")}</span></div></div><div className="welcome-image"><img src="/wardrobe-welcome.png" alt={t("粉色外套、牛仔裤、黑色长裤与白色运动鞋的平铺穿搭灵感图")}/><span className="image-caption">{t("衣橱灵感图 \u00B7 非你的单品")}</span><div className="image-stamp"><span>{t("EVERYDAY")}</span><strong>{t("possibilities.")}</strong></div></div></div>;
}
function EmptyState({ icon: Icon, title, text, action, onAction }: {
    icon: typeof Shirt;
    title: string;
    text: string;
    action: string;
    onAction: () => void;
}) { return <div className="empty-state"><div className="empty-icon"><Icon size={30} strokeWidth={1.3}/></div><h2>{title}</h2><p>{text}</p><Button variant="outline" onClick={onAction}>{action}<ArrowRight size={16}/></Button></div>; }
function OutfitCollage({ asset, itemIds, items }: {
    asset?: string | null;
    itemIds: string[];
    items: ItemRecord[];
}) {
    const { t } = useI18n();
    return <div className="outfit-visual">{asset && <Photo asset={asset} name={t("搭配照片")} className="outfit-cover-photo"/>}
    {!!itemIds.length && <div className={asset ? "outfit-piece-strip" : `outfit-collage count-${Math.min(itemIds.length, 4)}`}>{itemIds.slice(0, 4).map(id => { const item = items.find(i => i.id === id); return item ? <Photo key={id} asset={item.data.asset} name={item.data.name}/> : null; })}{itemIds.length > 4 && <span className="more-pieces">+{itemIds.length - 4}</span>}</div>}
  </div>;
}
function FormError({ message }: {
    message: string;
}) { return message ? <div className="form-error" role="alert"><AlertCircle size={16}/><span>{message}</span></div> : null; }
function ItemEditor({ record, initialCategory, onClose, onSave }: {
    record?: ItemRecord;
    initialCategory?: Item["category"];
    onClose: () => void;
    onSave: Save;
}) {
    const { t } = useI18n();
    const [data, setData] = useState<Item>(record?.data || { ...blankItem, category: initialCategory || "top" });
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // Synchronize the selected File with its browser-owned object URL.
    useEffect(() => { if (!file)
        return; const url = URL.createObjectURL(file);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
    const submit = async (archive = data.archived) => { setBusy(true); setError(""); try {
        if (!data.name.trim())
            throw new Error(t("请给单品起个名字"));
        const asset = file ? (await uploadAsset(file)).hash : data.asset;
        await onSave("item", { ...data, archived: archive, asset }, record);
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
    } };
    return <Dialog open onOpenChange={(open: boolean) => { if (!open && !busy)
        onClose(); }}><DialogContent className="editor-dialog item-dialog"><DialogHeader><DialogTitle>{record ? t("单品详情") : t("添加单品")}</DialogTitle><DialogDescription>{t("原图会完整保存。你可以随时补充或修改信息。")}</DialogDescription></DialogHeader><form onSubmit={e => { e.preventDefault(); void submit(); }}><div className="item-form-grid"><div><label className="upload-zone" htmlFor="item-photo">{preview || data.asset ? <img src={preview || `/api/assets/${data.asset}`} alt={t("单品照片预览")}/> : <div><ImagePlus size={36} strokeWidth={1.2}/><strong>{t("放进一张照片")}</strong><span>{t("点击选择照片或拍照")}</span></div>}<span className="upload-hover"><Camera size={16}/> {preview || data.asset ? t("更换原图") : t("选择照片")}</span></label><input id="item-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 20 * 1024 * 1024) {
        setError(t("单张图片最多 20 MB"));
        return;
    } if (f) {
        setFile(f);
        setError("");
    } }}/><p className="field-hint">{t("JPG / PNG / WebP / GIF / AVIF")}<br />{t("单张最多 20 MB，不压缩原图")}</p>{data.asset && <a className="text-link text-sm" href={`/api/assets/${data.asset}`} download>{t("下载原图")}<Download size={14}/></a>}</div><div className="form-fields"><div className="field"><Label htmlFor="item-name">{t("单品名称")}<span>*</span></Label><Input id="item-name" required maxLength={100} autoFocus value={data.name} placeholder={t("例如：短款牛仔外套")} onChange={e => setData({ ...data, name: e.target.value })}/></div><div className="field-pair"><div className="field"><Label>{t("分类")}</Label><Picker label={t("单品分类")} value={data.category} onChange={value => { const category = value as Item["category"]; const allowed = CATEGORY_MEASUREMENTS[category] || []; setData({ ...data, category, fit: garmentCategory(category) ? data.fit : null, shoeFit: category === "shoes" ? data.shoeFit : null, shoeSize: category === "shoes" ? data.shoeSize : { eu: null, cn: null }, measurements: Object.fromEntries(Object.entries(data.measurements).filter(([key]) => allowed.some(value => value === key))) }); }} options={translatedOptions(CATEGORIES, t)}/></div><div className="field"><Label htmlFor="item-color">{t("颜色")}</Label><Input id="item-color" maxLength={50} value={data.color} placeholder={t("例如：深蓝")} onChange={e => setData({ ...data, color: e.target.value })}/></div></div><ItemDetailsFields item={data} onChange={setData}/><div className="field"><Label>{t("适合场合")}</Label><Chips options={OCCASIONS} value={data.occasions} onChange={occasions => setData({ ...data, occasions })}/></div><div className="field"><Label>{t("季节")}</Label><Chips options={SEASONS} value={data.seasons} onChange={seasons => setData({ ...data, seasons })}/></div><div className="field"><Label htmlFor="item-notes">{t("穿着备注")}</Label><Textarea id="item-notes" maxLength={3000} rows={3} value={data.notes} placeholder={t("版型、搭配想法，或舒适度\u2026")} onChange={e => setData({ ...data, notes: e.target.value })}/></div></div></div><FormError message={error}/><DialogFooter className="editor-footer">{record && <Button type="button" variant="ghost" className="mr-auto" disabled={busy} onClick={() => void submit(!data.archived)}><Archive size={16}/>{data.archived ? t("放回衣橱") : t("收起单品")}</Button>}<Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("取消")}</Button><Button type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>}{busy ? t("保存中\u2026") : t("保存单品")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
function OutfitEditor({ record, items, onClose, onSave }: {
    record?: OutfitRecord;
    items: ItemRecord[];
    onClose: () => void;
    onSave: Save;
}) {
    const { t } = useI18n();
    const [data, setData] = useState<Outfit>(record?.data || { ...blankOutfit });
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const submit = async (archive = data.archived) => {
        setBusy(true);
        setError("");
        try {
            if (!data.name.trim())
                throw new Error(t("请给搭配起个名字"));
            if (!file && !data.asset && !data.itemIds.length)
                throw new Error(t("请添加搭配照片或选择单品"));
            const asset = file ? (await uploadAsset(file)).hash : data.asset;
            await onSave("outfit", { ...data, asset, archived: archive }, record);
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    };
    return <Dialog open onOpenChange={(open: boolean) => { if (!open && !busy)
        onClose(); }}><DialogContent className="editor-dialog outfit-dialog">
    <DialogHeader><DialogTitle>{record ? t("编辑搭配") : t("新建搭配")}</DialogTitle><DialogDescription>{t("保存搭配照片，也可以关联单品。之后修改不会改变日历里已保存的快照。")}</DialogDescription></DialogHeader>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={busy}><OutfitFields data={data} onChange={setData} file={file} onFile={setFile} items={items} onError={setError}/></fieldset>
      <FormError message={error}/><DialogFooter className="editor-footer">
        {record && <Button variant="ghost" type="button" className="mr-auto" disabled={busy} onClick={() => void submit(!data.archived)}><Archive size={16}/>{data.archived ? t("恢复搭配") : t("收起搭配")}</Button>}
        <Button variant="outline" type="button" disabled={busy} onClick={onClose}>{t("取消")}</Button><Button type="submit" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin"/>}{t("保存搭配")}</Button>
      </DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
function CalendarPanel({ entries, onAdd, onEdit }: {
    entries: CalendarRecord[];
    onAdd: (date: string) => void;
    onEdit: (entry: CalendarRecord) => void;
}) {
    const { t, locale } = useI18n();
    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [selected, setSelected] = useState(localDate());
    const [jumpOpen, setJumpOpen] = useState(false);
    const [jumpYear, setJumpYear] = useState(String(month.getFullYear()));
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - (first.getDay() + 6) % 7);
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const today = localDate();
    const selectedEntries = entries.filter(e => e.data.date === selected);
    const jump = (year: number, target: number) => {
        const next = new Date(year, target, 1);
        setMonth(next);
        setSelected(dayInMonth(selected, next.getFullYear(), next.getMonth()));
        setJumpOpen(false);
    };
    const validYear = /^\d{4}$/.test(jumpYear) && Number(jumpYear) >= 1900 && Number(jumpYear) <= 9999;
    return <div className="calendar-layout"><div className="calendar-board">
    <div className="calendar-heading">
      <Button variant="ghost" className="calendar-month-title" aria-label={t("选择年份和月份")} onClick={() => { setJumpYear(String(month.getFullYear())); setJumpOpen(true); }}>{month.getFullYear()} <span>/</span> {String(month.getMonth() + 1).padStart(2, "0")}<ChevronDown size={18}/></Button>
      <div><Button variant="ghost" size="icon" aria-label={t("上个月")} onClick={() => jump(month.getFullYear(), month.getMonth() - 1)}><ChevronLeft size={19}/></Button><Button variant="outline" size="sm" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelected(today); }}>{t("今天")}</Button><Button variant="ghost" size="icon" aria-label={t("下个月")} onClick={() => jump(month.getFullYear(), month.getMonth() + 1)}><ChevronRight size={19}/></Button></div>
    </div>
    <div className="calendar-weekdays">{[t("一"), t("二"), t("三"), t("四"), t("五"), t("六"), t("日")].map(d => <span key={d}>{d}</span>)}</div>
    <div className="calendar-days">{days.map(date => {
            const key = localDate(date);
            const dayEntries = entries.filter(e => e.data.date === key);
            const preview = dayEntries[0]?.data.snapshot.asset || dayEntries[0]?.data.snapshot.items[0]?.data.asset;
            return <button key={key} className={`calendar-day ${date.getMonth() !== month.getMonth() ? "outside" : ""} ${key === today ? "today" : ""} ${key === selected ? "selected" : ""}`} onClick={() => { setSelected(key); if (date.getMonth() !== month.getMonth())
                setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }} aria-label={t("{value1}，{value2} 套穿搭", { value1: key, value2: dayEntries.length })}>
        <span className="day-number">{date.getDate()}</span>{dayEntries[0] && <><div className="day-preview">{preview ? <img src={`/api/assets/${preview}`} alt="" loading="lazy"/> : <Shirt size={18}/>}</div><span className="day-label">{dayEntries[0].data.snapshot.name}</span><span className={`day-dot ${dayEntries.some(e => e.data.status === "worn") ? "worn" : ""}`}/></>}{dayEntries.length > 1 && <span className="day-more">+{dayEntries.length - 1}</span>}
      </button>;
        })}</div>
    <div className="calendar-legend"><span><i className="planned"/>{t("已计划")}</span><span><i className="worn"/>{t("已穿着")}</span><span>{t("点选日期，查看当天穿搭")}</span></div>
  </div><aside className="day-detail"><div className="day-detail-heading"><span>{t("当天穿搭")}</span><h3>{new Date(selected + "T12:00:00").toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" })}</h3></div>
    {selectedEntries.length ? selectedEntries.map(entry => <button key={entry.id} className="day-outfit" onClick={() => onEdit(entry)}>
      {entry.data.snapshot.asset && <Photo asset={entry.data.snapshot.asset} name={entry.data.snapshot.name} className="day-outfit-photo"/>}
      {!!entry.data.snapshot.items.length && <div className="snapshot-photos">{entry.data.snapshot.items.slice(0, 3).map(i => <Photo key={i.id} asset={i.data.asset} name={i.data.name}/>)}</div>}
      <div className="flex justify-between items-center gap-2"><strong>{entry.data.snapshot.name}</strong><span className={`status-badge ${entry.data.status}`}>{entry.data.status === "worn" ? t("已穿着") : t("已计划")}</span></div>{entry.data.notes && <p>{entry.data.notes}</p>}
    </button>) : <div className="day-empty"><CalendarDays size={32} strokeWidth={1.1}/><p>{t("这一天，还留着空白。")}</p><span>{t("拍一张穿搭照，或选择已有搭配。")}</span></div>}
    <Button variant="outline" className="w-full" onClick={() => onAdd(selected)}><Plus size={17}/>{t("添加当天穿搭")}</Button><p className="snapshot-note"><LockKeyhole size={13}/>{t("保存当时的照片与单品快照")}</p>
  </aside>
  <Dialog open={jumpOpen} onOpenChange={setJumpOpen}><DialogContent className="month-jump-dialog"><DialogHeader><DialogTitle>{t("跳转到年月")}</DialogTitle><DialogDescription>{t("选择年份，再点击要查看的月份。")}</DialogDescription></DialogHeader>
    <div className="year-jump"><Button variant="ghost" size="icon" aria-label={t("上一年")} disabled={!validYear || Number(jumpYear) <= 1900} onClick={() => setJumpYear(String(Number(jumpYear) - 1))}><ChevronLeft size={18}/></Button><div className="field"><Label htmlFor="calendar-year">{t("年份")}</Label><Input id="calendar-year" type="number" min={1900} max={9999} step={1} value={jumpYear} onChange={event => setJumpYear(event.target.value)}/></div><Button variant="ghost" size="icon" aria-label={t("下一年")} disabled={!validYear || Number(jumpYear) >= 9999} onClick={() => setJumpYear(String(Number(jumpYear) + 1))}><ChevronRight size={18}/></Button></div>
    <div className="month-jump-grid">{Array.from({ length: 12 }, (_, index) => <Button key={index} variant={Number(jumpYear) === month.getFullYear() && index === month.getMonth() ? "default" : "outline"} disabled={!validYear} onClick={() => jump(Number(jumpYear), index)}>{index + 1}{t("月")}</Button>)}</div>
  </DialogContent></Dialog>
  </div>;
}
function CalendarEditor({ record, date, outfitId, outfits, items, onClose, onSave, onDelete }: {
    record?: CalendarRecord;
    date?: string;
    outfitId?: string;
    outfits: OutfitRecord[];
    items: ItemRecord[];
    onClose: () => void;
    onSave: Save;
    onDelete: (r: CalendarRecord) => Promise<void>;
}) {
    const { t } = useI18n();
    const [data, setData] = useState({ date: record?.data.date || date || localDate(), outfitId: record?.data.outfitId || outfitId || "", status: record?.data.status || (outfitId ? "planned" : "worn"), notes: record?.data.notes || "" });
    const [mode, setMode] = useState<"photo" | "existing">(record || outfitId ? "existing" : "photo");
    const [draft, setDraft] = useState<Outfit>({ ...blankOutfit, name: t("{value1} 的穿搭", { value1: date || localDate() }) });
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const execute = async (remove = false) => {
        setBusy(true);
        setError("");
        try {
            if (remove && record)
                await onDelete(record);
            else if (!record && mode === "photo") {
                if (!draft.name.trim())
                    throw new Error(t("请给搭配起个名字"));
                if (!file && !draft.asset)
                    throw new Error(t("请拍照或导入一张搭配照片"));
                const asset = file ? (await uploadAsset(file)).hash : draft.asset;
                await onSave("calendar", { date: data.date, status: data.status, notes: data.notes, newOutfit: { ...draft, asset } });
            }
            else {
                if (!data.outfitId)
                    throw new Error(t("请选择一套搭配"));
                await onSave("calendar", data, record);
            }
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    };
    const selectedOutfit = outfits.find(o => o.id === data.outfitId);
    return <Dialog open onOpenChange={(open: boolean) => { if (!open && !busy)
        onClose(); }}><DialogContent className={`editor-dialog calendar-dialog ${!record && mode === "photo" ? "photo-calendar-dialog" : ""}`}>
    <DialogHeader><DialogTitle>{record ? t("当天的穿搭") : t("添加当天穿搭")}</DialogTitle><DialogDescription>{record ? t("这里保留着保存时的照片与单品快照。") : t("直接记录照片，或选择已有搭配。照片穿搭会同时加入搭配集。")}</DialogDescription></DialogHeader>
    <form onSubmit={event => { event.preventDefault(); void execute(); }}>
      <fieldset disabled={busy}><div className="form-fields">
        <div className="field-pair"><div className="field"><Label htmlFor="wear-date">{t("日期")}</Label><Input id="wear-date" type="date" required value={data.date} onChange={event => setData({ ...data, date: event.target.value })}/></div><div className="field"><Label>{t("状态")}</Label><Picker label={t("穿搭状态")} value={data.status} options={{ planned: t("已计划"), worn: t("已穿着") }} onChange={value => setData({ ...data, status: value as "planned" | "worn" })}/></div></div>
        {record ? <>
          {record.data.snapshot.asset && <Photo asset={record.data.snapshot.asset} name={record.data.snapshot.name} className="calendar-snapshot-photo"/>}
          {!!record.data.snapshot.items.length && <div className="snapshot-photos large">{record.data.snapshot.items.map(item => <div key={item.id}><Photo asset={item.data.asset} name={item.data.name}/><span>{item.data.name}</span><ItemLabels item={item.data}/></div>)}</div>}
          <strong>{record.data.snapshot.name}</strong>
        </> : <>
          <div className="wear-mode" role="group" aria-label={t("添加穿搭方式")}><Button type="button" variant={mode === "photo" ? "default" : "outline"} aria-pressed={mode === "photo"} onClick={() => { setMode("photo"); setError(""); }}><Camera size={16}/>{t("照片新搭配")}</Button><Button type="button" variant={mode === "existing" ? "default" : "outline"} aria-pressed={mode === "existing"} onClick={() => { setMode("existing"); setError(""); }}>{t("选择已有搭配")}</Button></div>
          {mode === "photo" ? <OutfitFields data={draft} onChange={setDraft} file={file} onFile={setFile} items={items} onError={setError}/> : <div className="field"><Label>{t("选择搭配")}</Label><Picker label={t("选择一套搭配")} value={data.outfitId} options={Object.fromEntries(outfits.filter(o => !o.data.archived).map(o => [o.id, o.data.name]))} onChange={value => setData({ ...data, outfitId: value })}/>{!outfits.some(o => !o.data.archived) && <p className="field-hint">{t("还没有搭配，可以切换到「照片新搭配」直接保存穿搭照。")}</p>}{selectedOutfit && <OutfitCollage asset={selectedOutfit.data.asset} itemIds={selectedOutfit.data.itemIds} items={items}/>}</div>}
        </>}
        <div className="field"><Label htmlFor="wear-notes">{t("当天的备注")}</Label><Textarea id="wear-notes" value={data.notes} maxLength={3000} rows={3} placeholder={t("要去哪里？穿起来感觉怎么样？")} onChange={event => setData({ ...data, notes: event.target.value })}/></div>
      </div></fieldset>
      <FormError message={error}/><DialogFooter className="editor-footer">
        {record && <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" type="button" disabled={busy} className="mr-auto text-destructive">{t("删除记录")}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("删除这条日历记录？")}</AlertDialogTitle><AlertDialogDescription>{t("这一条记录和快照将被删除，衣橱单品和原搭配会保留。")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("保留记录")}</AlertDialogCancel><AlertDialogAction onClick={() => void execute(true)}>{t("确认删除")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("取消")}</Button><Button type="submit" disabled={busy || ((!record && mode === "photo") ? !file && !draft.asset : !data.outfitId)}>{busy && <Loader2 size={16} className="animate-spin"/>}{!record && mode === "photo" ? t("保存穿搭并加入搭配集") : t("保存穿搭")}</Button>
      </DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
function BackupPanel({ state, onImported }: {
    state: ClosetState;
    onImported: (id: string) => Promise<void>;
}) {
    const { t, locale } = useI18n();
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [manifest, setManifest] = useState<ClosetArchive | null>(null);
    const [lastExport, setLastExport] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);
    const exportAll = async () => { setBusy(true); setError(""); setProgress(t("读取最新衣橱\u2026")); try {
        const fresh = await api<ClosetState>(`/api/closet?collection=${encodeURIComponent(state.collectionId)}`);
        const blob = await exportArchive(fresh, setProgress);
        downloadBlob(blob, `new-closet-${localDate()}.zip`);
        setLastExport(new Date().toLocaleString(locale));
        toast.success(t("完整备份已生成，请保存下载文件"));
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
        setProgress("");
    } };
    const inspect = async (f: File) => { setBusy(true); setError(""); setProgress(t("读取备份清单\u2026")); setManifest(null); setFile(null); try {
        const m = await inspectArchive(f, setProgress);
        setManifest(m);
        setFile(f);
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
        setProgress("");
        if (fileInput.current)
            fileInput.current.value = "";
    } };
    const restore = async () => { if (!file || !manifest)
        return; setBusy(true); setError(""); try {
        const id = await importArchive(file, manifest, setProgress);
        setManifest(null);
        setFile(null);
        toast.success(t("衣橱已完整恢复，原有衣橱保留"));
        await onImported(id);
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
        setProgress("");
    } };
    return <div className="backup-area"><div className="data-summary"><div className="data-icon"><Database size={30} strokeWidth={1.4}/></div><div><h2>{t("整个衣橱，放进行李箱。")}</h2><p>{t("原始照片、单品资料、搭配关系与日历快照，一起带走。")}</p></div><span className="format-badge">{t("开放格式 \u00B7 ZIP + JSON")}</span></div><div className="backup-grid"><section className="backup-card"><span className="step-index">{t("01 / EXPORT")}</span><Download size={28} strokeWidth={1.3}/><h3>{t("完整导出")}</h3><p>{t("每张原图保持原始文件内容。解压后，照片与清单都可以直接打开。")}</p><div className="backup-stats"><span>{t("{count} 条记录", { count: state.records.length })}</span><span>{t("{count} 张原图", { count: state.assets.length })}</span><span>{formatSize(state.assets.reduce((n, a) => n + a.size, 0))}</span></div><Button onClick={() => void exportAll()} disabled={busy}><Download size={16}/>{t("下载完整备份")}</Button>{lastExport && <small className="last-export">{t("已于 {time} 生成下载", { time: lastExport })}</small>}</section><section className="backup-card"><span className="step-index">{t("02 / IMPORT")}</span><Upload size={28} strokeWidth={1.3}/><h3>{t("导入与恢复")}</h3><p>{t("先核对原图和记录，再建立一个新的衣橱。原有衣橱和资料完整保留。")}</p><div className="import-drop"><PackageOpen size={25} strokeWidth={1.3}/><span>{t("选择 New Closet 的 .zip 备份包")}</span><small>{t("首版支持 2 GB / 2000 条记录以内的备份")}</small></div><input ref={fileInput} type="file" accept=".zip,application/zip" className="sr-only" aria-label={t("选择备份文件")} onChange={e => { const f = e.target.files?.[0]; if (f)
        void inspect(f); }}/><Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={16}/>{t("选择备份并检查")}</Button></section></div>{busy && <div className="progress-banner" role="status"><Loader2 size={19} className="animate-spin"/><span>{progress || t("正在处理\u2026")} <small>{t("请保持此页面打开")}</small></span></div>}<FormError message={error}/><div className="data-principles"><div><CheckCircle2 size={18}/><div><h4>{t("照片可独立使用")}</h4><p>{t("原图以内容哈希命名，清单保留原文件名。")}</p></div></div><div><CheckCircle2 size={18}/><div><h4>{t("记录可理解")}</h4><p>{t("JSON 保存字段与关联，包含数据格式版本。")}</p></div></div><div><CheckCircle2 size={18}/><div><h4>{t("历史有快照")}</h4><p>{t("日历里的穿搭，不随之后的编辑而改变。")}</p></div></div></div><div className="sync-explainer"><Cloud size={20}/><div><strong>{t("在 iOS、Android 和电脑上接着用")}</strong><p>{t("在同一网络中打开本机服务地址，使用同一衣橱密码即可访问。联网时自动刷新；离线编辑和原生 App 暂未提供。")}</p></div></div>
    <Dialog open={!!manifest} onOpenChange={(open: boolean) => { if (!open && !busy) {
        setManifest(null);
        setFile(null);
    } }}><DialogContent><DialogHeader><DialogTitle>{t("备份检查通过")}</DialogTitle><DialogDescription>{t("图片内容与 SHA-256 一致，记录关联完整。确认后建立新衣橱。")}</DialogDescription></DialogHeader>{manifest && <div className="import-preview"><h3>{manifest.collection.name}</h3><p>{file?.name} · {formatSize(file?.size || 0)}</p><div><span>{t("单品")}<strong>{manifest.records.filter(r => r.kind === "item").length}</strong></span><span>{t("搭配")}<strong>{manifest.records.filter(r => r.kind === "outfit").length}</strong></span><span>{t("日历")}<strong>{manifest.records.filter(r => r.kind === "calendar").length}</strong></span><span>{t("子集")}<strong>{manifest.records.filter(record => record.kind === "subset").length}</strong></span><span>{t("原图")}<strong>{manifest.assets.length}</strong></span></div></div>}{busy && <p className="inline-progress"><Loader2 size={16} className="animate-spin"/>{progress}</p>}<FormError message={error}/><DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setManifest(null); setFile(null); }}>{t("取消")}</Button><Button disabled={busy} onClick={() => void restore()}>{busy ? t("恢复中\u2026") : t("导入为新衣橱")}<ArrowRight size={16}/></Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
function AssistantPanel({ state }: {
    state: ClosetState;
}) {
    const { t, locale } = useI18n();
    const [request, setRequest] = useState(t("用现有单品搭配三套适合日常出门的穿搭，考虑整体比例和走路的舒适度。"));
    const [copied, setCopied] = useState(false);
    const prompt = wardrobePrompt(state, request, locale);
    const count = state.records.filter(r => r.kind === "item" && !r.data.archived).length;
    const copy = async () => { try {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        toast.success(t("已复制，可粘贴给你常用的 AI"));
        setTimeout(() => setCopied(false), 3000);
    }
    catch {
        toast.error(t("无法访问剪贴板，请在下方文本中手动复制"));
    } };
    return <div className="assistant-layout"><section className="assistant-intro"><div className="sparkle-box"><Sparkles size={29} strokeWidth={1.4}/></div><span className="step-index">{t("BRING YOUR OWN AI")}</span><h2>{t("让灵感，从真实衣橱出发。")}</h2><p>{t("把单品和穿着需求整理成一份上下文，带给你正在使用的 AI。")}</p><div className="assistant-note"><LockKeyhole size={18}/><p>{t("此页不会自动发送衣橱或照片给外部模型。当前尚未连接模型服务。")}</p></div></section><section className="assistant-form"><div className="field"><Label htmlFor="ai-request">{t("这次想怎么穿？")}</Label><Textarea id="ai-request" rows={4} value={request} maxLength={3000} onChange={e => setRequest(e.target.value)}/></div><div className="field"><div className="flex justify-between gap-3"><Label htmlFor="ai-context">{t("可复制的衣橱上下文")}</Label><span className="text-sm text-muted-foreground">{t("{count} 件单品 · 不含照片", { count })}</span></div><Textarea id="ai-context" className="context-preview" rows={10} readOnly value={prompt}/></div><Button onClick={() => void copy()} disabled={!count}>{copied ? <Check size={16}/> : <Copy size={16}/>}{copied ? t("已复制") : t("复制给我常用的 AI")}</Button>{!count && <p className="field-hint">{t("添加单品后，就可以生成真实的衣橱上下文。")}</p>}</section></div>;
}
