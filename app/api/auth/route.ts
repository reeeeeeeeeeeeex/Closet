import { cookies } from "next/headers";
import { z } from "zod";
import { checkPassword, createPassword, issueSession, passwordConfigured, SESSION_COOKIE, SESSION_SECONDS, setupAllowed } from "@/lib/local-auth";
import { ApiError, failure, json, limitedJson, sameOrigin } from "@/lib/server";

export const runtime = "nodejs";
const attempts = globalThis as typeof globalThis & { closetLoginAttempts?: number[] };
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { password } = z.object({ password: z.string().min(8, "密码至少 8 个字符").max(256) }).parse(await limitedJson(request, 2000));
    attempts.closetLoginAttempts = (attempts.closetLoginAttempts || []).filter(time => time > Date.now() - 60000);
    if (attempts.closetLoginAttempts.length >= 10) throw new ApiError(429, "尝试过于频繁，请一分钟后重试");
    attempts.closetLoginAttempts.push(Date.now());
    if (!await passwordConfigured()) {
      if (!setupAllowed()) throw new ApiError(403, "请先在本机启动服务并设置密码，再开启局域网访问");
      const hostname = new URL(`http://${request.headers.get("host") || new URL(request.url).host}`).hostname;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) throw new ApiError(403, "请在本机地址设置密码");
      await createPassword(password);
    } else if (!await checkPassword(password)) throw new ApiError(401, "密码不正确");
    attempts.closetLoginAttempts = [];
    (await cookies()).set(SESSION_COOKIE, await issueSession(), { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: SESSION_SECONDS });
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" }); return json({ ok: true }); }
  catch (error) { return failure(error); }
}
