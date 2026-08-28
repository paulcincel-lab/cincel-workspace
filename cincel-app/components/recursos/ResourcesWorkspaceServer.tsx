import ResourcesWorkspace from "@/components/recursos/ResourcesWorkspace";
import { fetchResourceLinksAction } from "@/lib/actions/resources-actions";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof ResourcesWorkspace>, "initialLinks">;

/**
 * Server Component wrapper: fetches resource links so the workspace renders
 * with real data on first paint instead of template defaults.
 */
export default async function ResourcesWorkspaceServer(props: Props) {
  let initialLinks: Awaited<ReturnType<typeof fetchResourceLinksAction>> = [];
  try {
    initialLinks = await fetchResourceLinksAction();
  } catch {
    // Not authorized / no session — the client hydrates itself.
  }
  return <ResourcesWorkspace {...props} initialLinks={initialLinks} />;
}
