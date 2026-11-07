import PortalNotFoundView from "@/components/portal/PortalNotFoundView";
import { getPortalAppearance } from "@/lib/portal/appearance";

/** Portal 404 (FE §3.4, §3.11): unknown pages and projects the client can't see; rendered inside the portal shell. */
export default async function PortalNotFound() {
  const appearance = await getPortalAppearance();
  return <PortalNotFoundView redesign={appearance.redesignEnabled} />;
}
