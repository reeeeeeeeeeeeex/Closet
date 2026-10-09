import { redirect } from "next/navigation";
import { getLocalUser } from "@/lib/local-auth";
import Closet from "@/components/closet";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  if (!await getLocalUser()) redirect("/login");
  return <Closet />;
}
