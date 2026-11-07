/**
 * Nav item "Proyectos" (/proyectos) of the new shell (redesign FE §3.1, §21.1; Phase 4).
 * `resolve` returns the item, or null while it stays hidden: the redesign
 * flag is off for the viewer, the portfolio read is still a stub
 * (`IMPLEMENTED.fetchProjectsPortfolioAction`), or the viewer can't view
 * projects.
 */
import { FolderKanban } from "lucide-react";

import { IMPLEMENTED } from "@/lib/actions/projects-actions.flags";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import type { NavItem, NavItemSource } from "@/lib/ui/nav";

export const PROYECTOS_NAV_ITEM: NavItem = { key: "proyectos", label: "Proyectos", href: "/proyectos", icon: FolderKanban };

export const proyectosNavItem: NavItemSource = {
  key: "proyectos",
  section: "items",
  order: 40,
  resolve: async () => {
    if (!IMPLEMENTED.fetchProjectsPortfolioAction) return null;
    const appearance = await getResolvedAppearance();
    if (!appearance.redesignEnabled) return null;

    const user = await requireCapabilityUser();
    if (!resolveProjectsCapabilities(user).canViewProjects) return null;
    return PROYECTOS_NAV_ITEM;
  },
};
