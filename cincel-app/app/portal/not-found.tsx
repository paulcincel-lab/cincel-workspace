import PortalNotFoundView from "@/components/portal/PortalNotFoundView";

/** Portal 404 (FE §3.4, §3.11): unknown pages and projects the client can't see; rendered inside the portal shell. */
export default function PortalNotFound() {
  return <PortalNotFoundView />;
}
