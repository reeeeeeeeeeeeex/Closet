import { selectedProfile, publicProfile } from "@/lib/profiles";
import Closet from "@/components/closet";
export const dynamic = "force-dynamic";
export default async function HomePage() { const profile = publicProfile(await selectedProfile()); return <Closet key={profile.id} profile={profile}/>; }
