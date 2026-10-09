import { redirect } from "next/navigation";
import { getLocalUser, passwordConfigured, setupAllowed } from "@/lib/local-auth";
import { LoginForm } from "./login-form";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await getLocalUser()) redirect("/");
  const configured = await passwordConfigured();
  return <LoginForm setup={!configured} allowed={configured || setupAllowed()} />;
}
