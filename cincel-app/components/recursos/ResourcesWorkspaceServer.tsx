import ResourcesWorkspace from "@/components/recursos/ResourcesWorkspace";
import { fetchResourceLinksAction } from "@/lib/actions/resources-actions";
import { isDriveConfigured } from "@/lib/google/client";
import type { ComponentProps } from "react";

type Props = Omit<
  ComponentProps<typeof ResourcesWorkspace>,
  "initialLinks" | "driveEnabled"
>;

/**
 * Server Component wrapper: fetches resource links so the workspace renders
 * with real data on first paint, and tells it whether the Drive picker is
 * available (service-account env vars set).
 */
export default async function ResourcesWorkspaceServer(props: Props) {
  let initialLinks: Awaited<ReturnType<typeof fetchResourceLinksAction>> = [];
  try {
    initialLinks = await fetchResourceLinksAction();
  } catch {
    // Not authorized / no session — the client hydrates itself.
  }
  return (
    <ResourcesWorkspace
      {...props}
      initialLinks={initialLinks}
      driveEnabled={isDriveConfigured()}
    />
  );
}
