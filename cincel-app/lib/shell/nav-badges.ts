"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { mejorasCountsOptions } from "@/lib/query/options/soporte";
import { shellBadgesOptions } from "@/lib/query/options/shell";
import { useDueReminderCount } from "@/lib/shell/sidebar-slots/bandeja-badge-view";
import type { ShellBadges } from "@/lib/types/shell";
import type { NavItem, NavItemKey } from "@/lib/ui/nav";

/** The poll of the Mejoras count, like the shell badges. */
const MEJORAS_POLL_MS = 60_000;

/** The counter each nav item shows; an item without one shows none. */
export type NavBadges = Partial<Record<NavItemKey, number>>;

/**
 * The live Mi espacio count from `shell.badges`: unread Bandeja items plus the
 * reminders still due today (a reminder leaves the count once its time passes).
 */
export function useBandejaCount(badges: ShellBadges | undefined): number {
  const reminders = useDueReminderCount(badges?.bandeja.dueReminders, badges?.bandeja.renderedAt);
  return (badges?.bandeja.unreadCount ?? 0) + reminders;
}

/**
 * The nav badges (plan §4.3 Shell): Tareas = my open tasks, Mi espacio =
 * unread Bandeja + due reminders, from `useQuery(qk.shell.badges())`, which
 * the `(staff)` layout hydrates and the 60 s poll keeps fresh. Every
 * `useQuery` on the key shares one cache entry and one poll. Mejoras = the
 * `nuevo` solicitudes of `qk.mejoras.counts()`, read only while `items` holds
 * the Mejoras item (a viewer with `canManageSupport`); a triage updates it at once.
 */
export function useNavBadges(items: readonly NavItem[] = []): NavBadges {
  const { data } = useQuery(shellBadgesOptions());
  const bandeja = useBandejaCount(data);
  const tareas = data?.tareasOpen ?? 0;
  const hasMejoras = items.some((item) => item.key === "mejoras");
  const { data: mejorasCounts } = useQuery({ ...mejorasCountsOptions(), enabled: hasMejoras, refetchInterval: MEJORAS_POLL_MS });
  const mejoras = hasMejoras ? mejorasCounts?.nuevo : undefined;
  return useMemo(
    () => (mejoras === undefined ? { tareas, "mi-espacio": bandeja } : { tareas, "mi-espacio": bandeja, mejoras }),
    [tareas, bandeja, mejoras],
  );
}

/** The items with their live badge (absent at 0, so a badge hides at zero). */
export function withNavBadges(items: readonly NavItem[], badges: NavBadges): NavItem[] {
  return items.map((item) => {
    const count = badges[item.key];
    const badge = typeof count === "number" && count > 0 ? Math.floor(count) : undefined;
    if (badge === item.badge) return item;
    const next: NavItem = { ...item, badge };
    if (badge === undefined) delete next.badge;
    return next;
  });
}
