/**
 * Resource links data access.
 *
 * Phase 2: reads/writes go to Postgres via the Server Actions in
 * `lib/actions/resources-actions.ts` (Drizzle + session authz). This module
 * keeps its historical function names/signatures so `ResourcesWorkspace`
 * doesn't change.
 */
import type { ResourceLink } from "@/lib/types/resource";
import {
  fetchResourceLinksAction,
  saveResourceLinksAction,
  deleteResourceLinkAction,
} from "@/lib/actions/resources-actions";

export type { ResourceLink };

export async function fetchResourceLinks(): Promise<ResourceLink[]> {
  return fetchResourceLinksAction();
}

export async function saveResourceLinks(links: ResourceLink[]): Promise<void> {
  await saveResourceLinksAction(links);
}

export async function deleteResourceLink(id: string): Promise<void> {
  await deleteResourceLinkAction(id);
}
