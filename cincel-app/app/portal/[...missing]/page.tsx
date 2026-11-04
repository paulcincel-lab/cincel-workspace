import { notFound } from "next/navigation";

/** Unknown `/portal/*` URLs render the portal 404 (inside the portal shell) instead of the app-wide one. */
export default function PortalMissingPage() {
  notFound();
}
