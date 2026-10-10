import { cookies } from "next/headers";
import { z } from "zod";
import { authenticate, AuthError, authStatus, createAccount, issueSession, SESSION_COOKIE, SESSION_SECONDS, setupAllowed } from "@/lib/local-auth";
import { ApiError, failure, json, limitedJson, sameOrigin } from "@/lib/server";

export const runtime = "nodejs";
const attempts = globalThis as typeof globalThis & { closetLoginAttempts?: number[] };
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { username, password, action } = z.object({ username: z.string().trim().min(1, "请填写账号").max(100), password: z.string().min(1, "请填写密码").max(256), action: z.enum(["login", "register", "claim"]).default("login") }).parse(await limitedJson(request, 4000));
    attempts.closetLoginAttempts = (attempts.closetLoginAttempts || []).filter(time => time > Date.now() - 60000);
    if (attempts.closetLoginAttempts.length >= 10) throw new ApiError(429, "尝试过于频繁，请一分钟后重试");
    attempts.closetLoginAttempts.push(Date.now());
    if (!(await authStatus()).configured) {
      if (!setupAllowed()) throw new ApiError(403, "请先在本机启动服务并设置密码，再开启局域网访问");
      const hostname = new URL(`http://${request.headers.get("host") || new URL(request.url).host}`).hostname;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) throw new ApiError(403, "请在本机地址设置密码");
    }
    const account = action === "login" ? await authenticate(username, password) : await createAccount(username, password, action === "claim");
    attempts.closetLoginAttempts = [];
    (await cookies()).set(SESSION_COOKIE, issueSession(account), { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: SESSION_SECONDS });
    return json({ ok: true });
  } catch (error) { return error instanceof AuthError ? json({ error: error.message }, error.status) : failure(error); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" }); return json({ ok: true }); }
  catch (error) { return failure(error); }
}
