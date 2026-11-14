/**
 * Nav item "Mejoras" (/mejoras) of the shell (Soporte S4, #1114). It shows
 * only with `canManageSupport` and while `MEJORAS_ENABLED` is on, with the
 * count of `nuevo` solicitudes as its badge (the client keeps it live with
 * `qk.mejoras.counts()`). It sits right after Asistente.
 */
import { Lightbulb } from "lucide-react";

import { mejorasCountsAction } from "@/lib/actions/mejoras-actions";
import { canManageSupport } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { MEJORAS_ENABLED } from "@/lib/soporte/flags";
import type { NavItemSource } from "@/lib/ui/nav";

export const mejorasNavItem: NavItemSource = {
  key: "mejoras",
  section: "items",
  order: 75,
  resolve: async () => {
    if (!MEJORAS_ENABLED) return null;
    const user = await requireCapabilityUser();
    if (!canManageSupport(user)) return null;
    let nuevo = 0;
    try {
      nuevo = (await mejorasCountsAction()).nuevo;
    } catch {
      // The badge is a hint; the item still shows.
    }
    return { key: "mejoras", label: "Mejoras", href: "/mejoras", icon: Lightbulb, badge: nuevo };
  },
};
