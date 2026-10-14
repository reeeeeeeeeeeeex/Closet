"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Square, Copy } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useI18n } from "@/lib/i18n/provider";
import { api } from "@/lib/portable";
import { announceProfileChange, profileFetch, withProfileActivity } from "@/lib/profile-client";
import { wardrobePrompt, type ClosetState } from "@/lib/domain";
import type { AiEvent, ChatMessage, McpConnection, ModelSettings, ToolActivity, ToolScope } from "@/lib/ai-types";
import "./ai-assistant.css";

const initialSettings: ModelSettings = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "", hasKey: false, scopes: ["read", "photos"] };
function ScopePicker({ value, onChange, disabled = false, prefix }: { value: ToolScope[]; onChange: (v: ToolScope[]) => void; disabled?: boolean; prefix: string }) {
  const { t } = useI18n();
  const labels: [ToolScope, string][] = [["read", t("读取衣橱资料")], ["photos", t("查看照片")], ["sizes", t("读取身体尺码")], ["write", t("保存搭配与日历")]];
  return <div className="ai-permissions">{labels.map(([scope, label]) => <label key={scope} htmlFor={prefix + scope}><input id={prefix + scope} type="checkbox" checked={value.includes(scope)} disabled={disabled || scope === "read"} onChange={e => onChange(e.target.checked ? [...value, scope] : value.filter(v => v !== scope))}/>{label}</label>)}</div>;
}
export function AiAssistant({ state, onDraftChange, onBusyChange, onRefresh }: { state: ClosetState; onDraftChange: (v: boolean) => void; onBusyChange: (v: boolean) => void; onRefresh: () => Promise<unknown> }) {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState<ModelSettings>(initialSettings), [configured, setConfigured] = useState(false), [key, setKey] = useState(""), [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [prompt, setPrompt] = useState(""), [messages, setMessages] = useState<ChatMessage[]>([]), [events, setEvents] = useState<AiEvent[]>([]);
  const [connections, setConnections] = useState<McpConnection[]>([]), [activity, setActivity] = useState<ToolActivity[]>([]);
  const [connectionName, setConnectionName] = useState(""), [connectionScopes, setConnectionScopes] = useState<ToolScope[]>(["read", "photos"]), [newToken, setNewToken] = useState("");
  const abort = useRef<AbortController | null>(null), transcript = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([api<{ settings: ModelSettings | null }>("/api/ai/settings"), api<{ connections: McpConnection[]; activity: ToolActivity[] }>("/api/mcp/connections")]).then(([model, external]) => {
      if (!active) return;
      setSettings(model.settings || initialSettings); setConfigured(!!model.settings); setConnections(external.connections); setActivity(external.activity); setLoaded(true);
    }).catch(e => { if (active) { setError(e instanceof Error ? e.message : t("无法载入 AI 配置")); setLoaded(true); } });
    return () => { active = false; abort.current?.abort(); };
  }, [t]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" }); }, [messages, events]);
  const update = (value: Partial<ModelSettings>) => { setSettings(s => ({ ...s, ...value })); setDirty(true); onDraftChange(true); };
  const work = async (fn: () => Promise<void>) => {
    setBusy(true); onBusyChange(true); setError("");
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : t("操作失败，请重试")); }
    finally { setBusy(false); onBusyChange(false); }
  };
  const reloadExternal = async () => { const next = await api<{ connections: McpConnection[]; activity: ToolActivity[] }>("/api/mcp/connections"); setConnections(next.connections); setActivity(next.activity); };
  const saveSettings = () => work(async () => {
    const next = await api<{ settings: ModelSettings }>("/api/ai/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model, scopes: settings.scopes, apiKey: key || undefined }) });
    setSettings(next.settings); setConfigured(true); setKey(""); setDirty(false); onDraftChange(!!prompt.trim() || !!connectionName.trim());
  });
  const send = () => work(() => withProfileActivity(async () => {
    const controller = new AbortController(); abort.current = controller;
    const question = prompt.trim(), history = messages.slice(-20);
    setEvents([]); setMessages([...history, { role: "user", content: question }]);
    let answered = false;
    try {
      const response = await profileFetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionId: state.collectionId, prompt: question, history }), signal: controller.signal });
      if (!response.ok) { const data = await response.json(); if (data.code === "PROFILE_CHANGED") announceProfileChange(); throw Error(data.error || t("请求失败")); }
      const reader = response.body?.getReader(); if (!reader) throw Error(t("连接中断，请重试"));
      const decoder = new TextDecoder(); let buffer = "";
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as AiEvent;
        if (event.type === "error") throw Error(event.message);
        if (event.type === "answer") { answered = true; setMessages([...history, { role: "user", content: question }, { role: "assistant", content: event.text }]); setPrompt(""); onDraftChange(dirty || !!connectionName.trim()); }
        else setEvents(previous => [...previous, event]);
      };
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end; while ((end = buffer.indexOf("\n")) !== -1) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); consume(line); }
      }
      buffer += decoder.decode(); consume(buffer);
      if (!answered) throw Error(t("连接中断，未收到完整回答，请重试"));
    } catch (e) {
      setMessages(history); controller.abort();
      throw e instanceof Error && e.name === "AbortError" ? Error(t("已停止本轮请求；已完成的保存可在衣橱中查看")) : e;
    } finally {
      abort.current = null;
      await onRefresh(); await reloadExternal();
    }
  }));
  const createExternal = () => work(async () => {
    const result = await api<{ token: string }>("/api/mcp/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: connectionName, collectionId: state.collectionId, scopes: connectionScopes }) });
    setNewToken(result.token); setConnectionName(""); onDraftChange(dirty || !!prompt.trim()); await reloadExternal();
  });
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); } catch { setError(t("无法访问剪贴板，请手动复制")); } };
  const collectionName = state.collections.find(c => c.id === state.collectionId)?.name;
  const labels: Record<string, string> = { list_closets: t("查看衣橱"), list_subsets: t("查看分组"), search_items: t("查找单品"), get_item: t("查看单品详情"), search_outfits: t("查找搭配"), get_calendar: t("查看穿搭日历"), get_personal_sizes: t("读取身体尺码"), get_photos: t("查看照片"), create_outfit: t("保存搭配"), plan_outfit: t("安排穿搭") };
  return <section className="assistant-layout ai-workspace">
    <details className="ai-card" open={!configured}>
      <summary>{t("模型设置")}{configured && <span className="ai-muted">{settings.model}</span>}</summary>
      <div className="ai-settings-grid">
        <div className="field"><Label htmlFor="ai-provider">{t("接口类型")}</Label><select id="ai-provider" className="ai-select" disabled={busy} value={settings.provider} onChange={e => update({ provider: e.target.value as ModelSettings["provider"], baseUrl: e.target.value === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1" })}><option value="openai">{t("OpenAI 兼容接口")}</option><option value="anthropic">{t("Anthropic 原生接口")}</option></select></div>
        <div className="field"><Label htmlFor="ai-model">{t("模型名")}</Label><Input id="ai-model" disabled={busy} value={settings.model} maxLength={200} onChange={e => update({ model: e.target.value })}/></div>
        <div className="field ai-wide"><Label htmlFor="ai-base-url">{t("服务地址（包含 /v1 等路径）")}</Label><Input id="ai-base-url" disabled={busy} value={settings.baseUrl} maxLength={1000} onChange={e => update({ baseUrl: e.target.value })}/></div>
        <div className="field ai-wide"><Label htmlFor="ai-key">API Key</Label><Input id="ai-key" type="password" autoComplete="off" disabled={busy} value={key} maxLength={4000} placeholder={settings.hasKey ? t("已保存，留空继续使用") : t("填写服务密钥")} onChange={e => { setKey(e.target.value); setDirty(true); onDraftChange(true); }}/></div>
      </div>
      <ScopePicker prefix="model-" value={settings.scopes} disabled={busy} onChange={scopes => update({ scopes })}/>
      <p className="field-hint">{t("选择支持工具调用的模型；查看照片还需要模型支持视觉。密钥仅在电脑服务保存。")}</p>
      <div className="ai-actions"><Button disabled={!loaded || busy || !settings.model.trim()} onClick={() => void saveSettings()}>{t("保存模型设置")}</Button>{configured && <Button variant="outline" disabled={busy} onClick={() => void work(async () => { await api("/api/ai/settings", { method: "DELETE" }); setConfigured(false); setSettings(initialSettings); setKey(""); setDirty(false); onDraftChange(!!prompt.trim() || !!connectionName.trim()); })}>{t("清除模型配置")}</Button>}</div>
    </details>
    <div className="ai-card ai-chat">
      <div className="ai-card-heading"><strong>{t("和衣橱聊一聊")}</strong><span className="ai-muted">{collectionName}</span></div>
      <p className="field-hint">{t("发送后，模型会按已选权限查询当前衣橱并查看照片。保存搭配或安排日历时，请在需求中明确说明。")}</p>
      <div className="ai-transcript" ref={transcript} aria-live="polite">{messages.length ? messages.map((m, i) => <article key={i} className={"ai-message ai-message-" + m.role}><strong>{m.role === "user" ? t("我") : t("穿搭助手")}</strong><div>{m.content}</div></article>) : <p className="ai-empty">{t("例如：看看我的上装和鞋子，搭配两套适合通勤的穿搭，并解释选择理由。")}</p>}
        {!!events.length && <details className="ai-tool-trace" open={busy}><summary>{t("本轮衣橱操作")}</summary>{events.map((e, i) => e.type === "tool" ? <div key={i}>{labels[e.name] || e.name}<details><summary>{t("查看参数")}</summary><pre>{JSON.stringify(e.arguments, null, 2)}</pre></details></div> : e.type === "tool_result" ? <p key={i}>{labels[e.name] || e.name} · {e.isError ? t("未完成") : e.imageCount ? t("已读取 {count} 张照片", { count: e.imageCount }) : t("已完成")}</p> : null)}</details>}
        {busy && <p className="inline-progress"><Loader2 size={16} className="animate-spin"/>{t("正在处理")}</p>}
      </div>
      <Label htmlFor="ai-chat-prompt">{t("这次想怎么穿？")}</Label><Textarea id="ai-chat-prompt" rows={3} maxLength={3000} disabled={busy} value={prompt} onChange={e => { setPrompt(e.target.value); onDraftChange(dirty || !!connectionName.trim() || !!e.target.value.trim()); }}/>
      <div className="ai-actions"><Button disabled={!loaded || busy || !configured || dirty || !prompt.trim()} onClick={() => void send()}><Send size={16}/>{t("发送")}</Button>{busy && <Button variant="outline" onClick={() => abort.current?.abort()}><Square size={14}/>{t("停止")}</Button>}<Button variant="ghost" disabled={busy || !messages.length} onClick={() => { setMessages([]); setEvents([]); }}>{t("开始新对话")}</Button></div>{dirty && <p className="field-hint">{t("先保存模型设置，再发送需求。")}</p>}
    </div>
    <details className="ai-card"><summary>{t("外部 AI 连接（MCP）")}</summary><p className="field-hint">{t("每个连接固定授权当前账号的指定衣橱。可以随时撤销，网页切换账号不会改变外部连接的资料范围。")}</p>
      <div className="field"><Label htmlFor="mcp-name">{t("连接名称")}</Label><Input id="mcp-name" value={connectionName} maxLength={100} disabled={busy} placeholder={t("例如：我的 AI 客户端")} onChange={e => { setConnectionName(e.target.value); onDraftChange(dirty || !!prompt.trim() || !!e.target.value.trim()); }}/></div>
      <ScopePicker prefix="connection-" value={connectionScopes} disabled={busy} onChange={setConnectionScopes}/>
      <Button disabled={!loaded || busy || !connectionName.trim()} onClick={() => void createExternal()}>{t("为当前衣橱创建连接")}</Button>
      {newToken && <div className="ai-token"><p>{t("令牌仅显示这一次，请保存到客户端配置。")}</p><Input aria-label={t("新连接令牌")} readOnly value={newToken}/><Button variant="outline" onClick={() => void copy(newToken)}><Copy size={16}/>{t("复制令牌")}</Button><Button variant="ghost" onClick={() => setNewToken("")}>{t("我已保存")}</Button></div>}
      <p className="field-hint">{t("HTTP 地址：当前 Closet 服务地址后加 /mcp；认证头为 Authorization: Bearer 加连接令牌。本机也可使用项目附带的 stdio 入口。")}</p>
      <ul className="ai-connections">{connections.map(c => <li key={c.id}><div><strong>{c.name}</strong><small>{state.collections.find(v => v.id === c.collectionId)?.name || c.collectionId} · {c.scopes.join(" / ")}</small></div><Button variant="outline" disabled={busy} onClick={() => void work(async () => { await api("/api/mcp/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) }); setNewToken(""); await reloadExternal(); })}>{t("撤销连接")}</Button></li>)}</ul>
      <details><summary>{t("最近的衣橱操作")}</summary><Button variant="ghost" disabled={busy} onClick={() => void work(reloadExternal)}>{t("刷新操作记录")}</Button>{activity.map(a => <p className="ai-activity" key={a.id}>{a.source} · {labels[a.tool] || a.tool} · {a.ok ? t("已完成") : t("未完成")} · {new Date(a.createdAt).toLocaleString(locale)}</p>)}</details>
    </details>
    <details className="ai-card"><summary>{t("可复制的衣橱上下文")}</summary><Textarea aria-label={t("可复制的衣橱上下文")} readOnly rows={8} value={wardrobePrompt(state, prompt, locale)}/><Button variant="outline" onClick={() => void copy(wardrobePrompt(state, prompt, locale))}><Copy size={16}/>{t("复制文字上下文")}</Button><p className="field-hint">{t("复制的文字不含照片；连接模型后可通过工具查看照片。")}</p></details>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
