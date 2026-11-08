/**
 * Nav item "Inicio" (/inicio) of the new shell (redesign FE §3.1, §21.1; Phase 3).
 * `resolve` returns the item, or null while it stays hidden: until
 * `fetchInicioAction` is implemented (`IMPLEMENTED` in
 * `lib/actions/dashboard-actions.flags.ts`).
 */
import { House } from "lucide-react";

import { IMPLEMENTED } from "@/lib/actions/dashboard-actions.flags";
import type { NavItemSource } from "@/lib/ui/nav";

export const inicioNavItem: NavItemSource = {
  key: "inicio",
  section: "items",
  order: 10,
  resolve: async () => {
    if (!IMPLEMENTED.fetchInicioAction) return null;
    return { key: "inicio", label: "Inicio", href: "/inicio", icon: House };
  },
};
