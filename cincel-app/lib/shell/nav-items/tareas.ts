/**
 * Nav item "Tareas" (/tareas) of the new shell (redesign FE §3.1, §21.1; Phase 3).
 * `resolve` returns the item with its badge, or null while it stays hidden
 * (its `IMPLEMENTED` flag is false or its read action reports disabled / empty).
 *
 * Contract stub: hidden until Phase 3 implements it.
 */
import type { NavItemSource } from "@/lib/ui/nav";

export const tareasNavItem: NavItemSource = {
  key: "tareas",
  section: "items",
  order: 30,
  resolve: async () => null,
};
