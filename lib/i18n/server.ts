import { cookies } from "next/headers";
import { resolveLocale } from "./core";
export async function requestLocale() { return resolveLocale((await cookies()).get("closet_locale")?.value); }
