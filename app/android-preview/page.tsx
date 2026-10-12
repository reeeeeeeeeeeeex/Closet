import Closet from "@/components/closet";
import { publicProfile, selectedProfile } from "@/lib/profiles";
export const dynamic = "force-dynamic";
/** Same Android UI using the web adapter, for isolated production-build visual acceptance. */
export default async function AndroidPreview() {
  const profile = publicProfile(await selectedProfile());
  return <Closet profile={profile} appearance="android"/>;
}
