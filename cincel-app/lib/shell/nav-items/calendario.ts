/**
 * Nav item "Calendario" (/calendario) of the shell (Calendario FE §2.2). It
 * sits right after Tareas (order 30) and hides without `canViewCalendar`.
 * On mobile it lives in the "Más" sheet (Decision F1).
 */
import { CalendarDays } from "lucide-react";

import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import type { NavItemSource } from "@/lib/ui/nav";

export const calendarioNavItem: NavItemSource = {
  key: "calendario",
  section: "items",
  order: 35,
  resolve: async () => {
    const user = await requireCapabilityUser();
    if (!resolveCalendarCapabilities(user).canViewCalendar) return null;
    return { key: "calendario", label: "Calendario", href: "/calendario", icon: CalendarDays };
  },
};
