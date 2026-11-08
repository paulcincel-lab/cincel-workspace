/**
 * Nav item "Tareas" (/tareas) of the new shell (redesign FE §3.1, §21.1; Phase 3).
 * `resolve` returns the item, or null while it stays hidden: the viewer can't
 * view activities. No badge read here: the open-tasks badge (frame `Sidebar`)
 * comes from `qk.shell.badges()` (`lib/shell/badges.ts`, one COUNT(*)).
 */
import { ListChecks } from "lucide-react";

import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import type { NavItemSource } from "@/lib/ui/nav";

export const tareasNavItem: NavItemSource = {
  key: "tareas",
  section: "items",
  order: 30,
  resolve: async () => {
    const user = await requireCapabilityUser();
    if (!resolveActivitiesCapabilities(user).canViewActivities) return null;
    return { key: "tareas", label: "Tareas", href: "/tareas", icon: ListChecks };
  },
};
