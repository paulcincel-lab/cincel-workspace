import "server-only";

import { redirect } from "next/navigation";

import { fetchResourceLinksAction } from "@/lib/actions/resources-actions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveResourcesCapabilities, type ResourcesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { visibleBibliotecaLinks } from "@/lib/biblioteca/catalog";
import { isPickerDriveConfigured } from "@/lib/google/picker-drive";
import type { ResourceLink } from "@/lib/types/resource";

export type BibliotecaData = {
  viewerId: string;
  capabilities: ResourcesCapabilities;
  /** Already filtered for the viewer (personal links, Empresa access). */
  links: ResourceLink[];
  driveEnabled: boolean;
};

/**
 * Server loader of the Biblioteca pages (redesign FE §3.7): the viewer, their
 * resource capabilities and the resource links they may see, read with the
 * existing `fetchResourceLinksAction`. Owner-only links are dropped here, on
 * the server, so they never reach another viewer's browser.
 */
export async function loadBibliotecaData(): Promise<BibliotecaData> {
  let user: AuthenticatedUser;
  try {
    user = await requireCapabilityUser();
  } catch {
    redirect("/login");
  }
  const capabilities = resolveResourcesCapabilities(user);
  const links = capabilities.canViewResources ? await fetchResourceLinksAction() : [];
  return {
    viewerId: user.member.id,
    capabilities,
    links: visibleBibliotecaLinks(links, { id: user.member.id, canViewEmpresa: capabilities.enterprise.canView }),
    driveEnabled: isPickerDriveConfigured(),
  };
}
