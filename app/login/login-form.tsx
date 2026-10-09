"use client";
import { useI18n } from "@/lib/i18n/provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function LoginForm({ setup, allowed }: {
    setup: boolean;
    allowed: boolean;
}) {
    const { t } = useI18n();
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (setup && password !== confirmation) {
            setError(t("两次输入的密码不一致"));
            return;
        }
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
            const result = await response.json();
            if (!response.ok)
                throw new Error(t(result.error || "登录失败"));
            router.replace("/");
            router.refresh();
        }
        catch (error) {
            setError(error instanceof Error ? error.message : t("连接失败，请重试"));
            setBusy(false);
        }
    }
    return <main className="login-shell"><section className="login-card"><Shirt size={36} strokeWidth={1.5}/><h1>{t("New Closet")}</h1><p>{setup ? t("设置一个密码，打开你的私人衣橱。") : t("欢迎回来，继续整理你的衣橱。")}</p>{allowed ? <form onSubmit={submit}><div className="field"><Label htmlFor="password">{setup ? t("设置密码") : t("衣橱密码")}</Label><Input id="password" type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={8} maxLength={256} required autoFocus value={password} onChange={event => setPassword(event.target.value)}/></div>{setup && <div className="field"><Label htmlFor="confirmation">{t("确认密码")}</Label><Input id="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={256} required value={confirmation} onChange={event => setConfirmation(event.target.value)}/></div>}{error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? t("正在打开\u2026") : setup ? t("创建私人衣橱") : t("进入衣橱")}</Button></form> : <p role="alert">{t("请先在本机启动服务并设置密码，再开启局域网访问。")}</p>}</section></main>;
}
