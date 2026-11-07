/**
 * Nav item "Tareas" (/tareas) of the new shell (redesign FE §3.1, §21.1; Phase 3).
 * `resolve` returns the item with its badge (my overdue tasks), or null while
 * it stays hidden: the redesign flag is off for the viewer, or the viewer
 * can't view activities.
 */
import { ListChecks } from "lucide-react";

import { fetchMyTasksAction } from "@/lib/actions/tasks-actions";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { isoDate } from "@/lib/tareas/query";
import { isDueDateLate } from "@/lib/tasks/status-options";
import type { TaskListItem } from "@/lib/types/core";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import type { NavItem, NavItemSource } from "@/lib/ui/nav";

/** Open tasks whose fecha compromiso is before `today` (`YYYY-MM-DD`). */
export function countOverdueTasks(
  tasks: Pick<TaskListItem, "commitmentDate" | "status" | "customStatus">[],
  today: string,
): number {
  return tasks.filter((t) => isDueDateLate(t.commitmentDate, today, t)).length;
}

export const tareasNavItem: NavItemSource = {
  key: "tareas",
  section: "items",
  order: 30,
  resolve: async () => {
    const appearance = await getResolvedAppearance();
    if (!appearance.redesignEnabled) return null;

    const user = await requireCapabilityUser();
    if (!resolveActivitiesCapabilities(user).canViewActivities) return null;

    const item: NavItem = { key: "tareas", label: "Tareas", href: "/tareas", icon: ListChecks };
    try {
      const overdue = countOverdueTasks(await fetchMyTasksAction(), isoDate(new Date()));
      return overdue > 0 ? { ...item, badge: overdue } : item;
    } catch (err) {
      // The badge is a hint; the page works without it.
      console.error("[nav] tareas overdue badge", err);
      return item;
    }
  },
};
