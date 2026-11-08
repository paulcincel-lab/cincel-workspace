import "server-only";

import { redirect } from "next/navigation";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveResourcesCapabilities, type ResourcesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import {
  bibliotecaQuerySections,
  canViewBibliotecaSection,
  visibleBibliotecaLinks,
  type BibliotecaLinksSection,
} from "@/lib/biblioteca/catalog";
import { isPickerDriveConfigured } from "@/lib/google/picker-drive";
import { listResourceLinks } from "@/lib/repositories/resources-repository";
import type { ResourceLink } from "@/lib/types/resource";

export type BibliotecaData = {
  viewerId: string;
  capabilities: ResourcesCapabilities;
  /** Already filtered for the viewer (personal links, Empresa access) and for the section. */
  links: ResourceLink[];
  driveEnabled: boolean;
};

/** The Biblioteca pages' viewer; a missing or ended session goes to the login. */
export async function requireBibliotecaViewer(): Promise<AuthenticatedUser> {
  try {
    return await requireCapabilityUser();
  } catch {
    redirect("/login");
  }
}

/**
 * The resource links of one Biblioteca screen (redesign FE §3.7, Query
 * Migration Phase 8) for `user`: the viewer's resource capabilities, the
 * links of `section` (null = the index) and whether the Drive picker is
 * configured. The section and the personal links are filtered **in SQL**
 * (`personal_for_id IS NULL OR = viewer`, `bibliotecaQuerySections`), so
 * another person's personal links never leave the database; this data is
 * dehydrated into public page HTML. `FORBIDDEN` when the viewer may not read
 * the section (`canViewBibliotecaSection`).
 */
export async function loadBibliotecaData(user: AuthenticatedUser, section: BibliotecaLinksSection | null): Promise<BibliotecaData> {
  const capabilities = resolveResourcesCapabilities(user);
  if (!canViewBibliotecaSection(capabilities, section)) throw new Error("FORBIDDEN");
  const viewerId = user.member.id;
  const sections = bibliotecaQuerySections(section, capabilities);
  const rows = sections.length > 0 ? await listResourceLinks({ section: sections, viewerId }) : [];
  // Mis vacaciones lists every document of its section (web links too), as it always did.
  const links =
    section === "mis-vacaciones"
      ? rows
      : visibleBibliotecaLinks(rows, { id: viewerId, canViewEmpresa: capabilities.enterprise.canView });
  return { viewerId, capabilities, links, driveEnabled: isPickerDriveConfigured() };
}
