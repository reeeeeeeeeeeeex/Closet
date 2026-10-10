"use client";
import { useI18n } from "@/lib/i18n/provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function LoginForm({ setup, legacy, allowed }: { setup: boolean; legacy: boolean; allowed: boolean }) {
  const { t } = useI18n(); const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "claim">(legacy ? "claim" : setup ? "register" : "login");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  function changeMode(next: typeof mode) { setMode(next); setPassword(""); setConfirmation(""); setError(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "register" && password !== confirmation) { setError(t("两次输入的密码不一致")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, action: mode }) });
      const result = await response.json(); if (!response.ok) throw new Error(t(result.error || "登录失败"));
      router.replace("/"); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : t("连接失败，请重试")); setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card"><Shirt size={36} strokeWidth={1.5}/><h1>{t("New Closet")}</h1>
    <p>{mode === "claim" ? t("为原衣橱补充账号名，验证原密码后继续使用，已有数据完整保留。") : mode === "register" ? t("创建账号，单品、搭配和尺码按账号独立保存。") : t("欢迎回来，使用账号和密码进入衣橱。")}</p>
    {allowed ? <><div className="login-modes" role="group" aria-label={t("登录方式")}><Button variant={mode === "login" ? "default" : "outline"} disabled={busy} onClick={() => changeMode("login")}>{t("登录")}</Button><Button variant={mode === "register" ? "default" : "outline"} disabled={busy} onClick={() => changeMode("register")}>{t("注册账号")}</Button>{legacy && <Button variant={mode === "claim" ? "default" : "outline"} disabled={busy} onClick={() => changeMode("claim")}>{t("绑定旧衣橱")}</Button>}</div>
    <form onSubmit={submit}><fieldset disabled={busy} className="login-fields"><div className="field"><Label htmlFor="username">{t("账号")}</Label><Input id="username" autoComplete="username" required maxLength={100} autoFocus value={username} onChange={event => setUsername(event.target.value)}/></div>
    <div className="field"><Label htmlFor="password">{mode === "claim" ? t("原衣橱密码") : t("密码")}</Label><Input id="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={1} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)}/></div>
    {mode === "register" && <div className="field"><Label htmlFor="confirmation">{t("确认密码")}</Label><Input id="confirmation" type="password" autoComplete="new-password" minLength={1} maxLength={256} required value={confirmation} onChange={event => setConfirmation(event.target.value)}/><span className="field-hint">{t("密码非空即可。")}</span></div>}</fieldset>
    {error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? t("正在打开…") : mode === "claim" ? t("绑定并进入衣橱") : mode === "register" ? t("创建账号并进入") : t("进入衣橱")}</Button></form></> : <p role="alert">{t("请先在本机创建账号，再开启局域网访问。")}</p>}
  </section></main>;
}
