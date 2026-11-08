/**
 * Nav item "Tareas" (/tareas) of the new shell (redesign FE §3.1, §21.1; Phase 3).
 * `resolve` returns the item with its badge (my open tasks, frame `Sidebar`),
 * or null while it stays hidden: the viewer can't view activities.
 */
import { ListChecks } from "lucide-react";

import { fetchMyTasksAction } from "@/lib/actions/tasks-actions";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { isTaskClosed } from "@/lib/tasks/status-options";
import type { TaskListItem } from "@/lib/types/core";
import type { NavItem, NavItemSource } from "@/lib/ui/nav";

/** Tasks still open: neither completed nor in a custom status that closes them. */
export function countOpenTasks(tasks: Pick<TaskListItem, "status" | "customStatus">[]): number {
  return tasks.filter((t) => !isTaskClosed(t)).length;
}

export const tareasNavItem: NavItemSource = {
  key: "tareas",
  section: "items",
  order: 30,
  resolve: async () => {
    const user = await requireCapabilityUser();
    if (!resolveActivitiesCapabilities(user).canViewActivities) return null;

    const item: NavItem = { key: "tareas", label: "Tareas", href: "/tareas", icon: ListChecks };
    try {
      const open = countOpenTasks(await fetchMyTasksAction());
      return open > 0 ? { ...item, badge: open } : item;
    } catch (err) {
      // The badge is a hint; the page works without it.
      console.error("[nav] tareas open badge", err);
      return item;
    }
  },
};
