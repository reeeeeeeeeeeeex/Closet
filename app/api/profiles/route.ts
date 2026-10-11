import { cookies } from "next/headers";
import { z } from "zod";
import { createProfile, listStoredProfiles, publicProfile, renameProfile, selectedProfile, issueSession, ProfileError, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/profiles";
import { json, failure, sameOrigin, limitedJson } from "@/lib/server";

const nameSchema = z.string().trim().min(1, "请填写账号名称").max(100, "账号名称不能超过 100 个字符");
async function remember(request: Request, profile: Parameters<typeof issueSession>[0]) {
  (await cookies()).set(SESSION_COOKIE, issueSession(profile), { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: SESSION_SECONDS });
}
const failed = (error: unknown) => error instanceof ProfileError ? json({ error: error.message }, error.status) : failure(error);
export async function GET(request: Request) {
  try { const current = await selectedProfile(); await remember(request, current); return json({ profiles: listStoredProfiles().map(publicProfile), current: publicProfile(current) }); }
  catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = z.discriminatedUnion("action", [z.object({ action: z.literal("create"), name: nameSchema }).strict(), z.object({ action: z.literal("select"), id: z.string().min(1).max(100) }).strict()]).parse(await limitedJson(request, 4000));
    const profile = input.action === "create" ? createProfile(input.name) : listStoredProfiles().find(profile => profile.id === input.id);
    if (!profile) throw new ProfileError(404, "账号不存在");
    await remember(request, profile); return json({ profile: publicProfile(profile) });
  } catch (error) { return failed(error); }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const input = z.object({ id: z.string().min(1).max(100), name: nameSchema }).strict().parse(await limitedJson(request, 4000));
    return json({ profile: publicProfile(renameProfile(input.id, input.name)) });
  } catch (error) { return failed(error); }
}
