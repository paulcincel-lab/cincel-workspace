/**
 * Nav item "Biblioteca" (/biblioteca) of the new shell (redesign FE §3.1, §21.1; Phase 4).
 * `resolve` returns the item, or null while it stays hidden: the redesign is
 * off for the viewer or the viewer can't see Recursos (`resources.canViewResources`).
 * The Biblioteca reads the existing resource actions, so no `IMPLEMENTED` flag gates it.
 */
import { LibraryBig } from "lucide-react";

import { resolveResourcesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import type { NavItemSource } from "@/lib/ui/nav";

export const bibliotecaNavItem: NavItemSource = {
  key: "biblioteca",
  section: "items",
  order: 60,
  resolve: async () => {
    const appearance = await getResolvedAppearance();
    if (!appearance.redesignEnabled) return null;
    const user = await requireCapabilityUser().catch(() => null);
    if (!user) return null;
    if (!resolveResourcesCapabilities(user).canViewResources) return null;
    return { key: "biblioteca", label: "Biblioteca", href: "/biblioteca", icon: LibraryBig };
  },
};
