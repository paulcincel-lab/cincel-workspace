/**
 * Nav item "Personas" (/personas) of the new shell (redesign FE §3.1, §21.1; Phase 4).
 * `resolve` returns the item, or null while it stays hidden: `fetchPeopleOverviewAction` is not implemented yet
 * (`people-actions.flags.ts`), or the viewer can see neither Equipo
 * (`team.canViewTeam`) nor the directory (`clients.canViewClients`).
 */
import { Users } from "lucide-react";

import { IMPLEMENTED } from "@/lib/actions/people-actions.flags";
import { resolveClientsCapabilities, resolveTeamCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import type { NavItemSource } from "@/lib/ui/nav";

export const personasNavItem: NavItemSource = {
  key: "personas",
  section: "items",
  order: 50,
  resolve: async () => {
    if (!IMPLEMENTED.fetchPeopleOverviewAction) return null;
    const user = await requireCapabilityUser().catch(() => null);
    if (!user) return null;
    if (resolveTeamCapabilities(user).canViewTeam) {
      return { key: "personas", label: "Personas", href: "/personas", icon: Users };
    }
    if (resolveClientsCapabilities(user).canViewClients) {
      return { key: "personas", label: "Personas", href: "/personas/clientes", icon: Users };
    }
    return null;
  },
};
