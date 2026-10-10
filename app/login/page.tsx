import { redirect } from "next/navigation";
import { getLocalUser, authStatus, setupAllowed } from "@/lib/local-auth";
import { LoginForm } from "./login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if ((await getLocalUser())?.username) redirect("/");
  const { configured, legacy } = await authStatus();
  return <LoginForm setup={!configured} legacy={legacy} allowed={configured || setupAllowed()} />;
}
