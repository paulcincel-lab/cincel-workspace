/**
 * Nav item "Ajustes" (/ajustes) of the new shell (redesign FE §3.1, §21.1; Phase 6).
 * `resolve` returns the item, or null while it stays hidden: `/ajustes` opens
 * Apariencia, which reads and writes the viewer's preferences, so the item
 * waits for `fetchMyPreferencesAction` / `updateMyPreferencesAction`
 * (`IMPLEMENTED` in `lib/actions/preferences-actions.flags.ts`). Every staff
 * member gets it; the Organización pages inside Ajustes have their own guards.
 */
import { Settings } from "lucide-react";

import { IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import type { NavItemSource } from "@/lib/ui/nav";

export const ajustesNavItem: NavItemSource = {
  key: "ajustes",
  section: "footer",
  order: 10,
  resolve: async () => {
    if (!IMPLEMENTED.fetchMyPreferencesAction || !IMPLEMENTED.updateMyPreferencesAction) return null;
    return { key: "ajustes", label: "Ajustes", href: "/ajustes", icon: Settings };
  },
};
