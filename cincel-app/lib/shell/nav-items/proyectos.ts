/**
 * Nav item "Proyectos" (/proyectos) of the new shell (redesign FE §3.1, §21.1; Phase 4).
 * `resolve` returns the item with its badge, or null while it stays hidden
 * (its `IMPLEMENTED` flag is false or its read action reports disabled / empty).
 *
 * Contract stub: hidden until Phase 4 implements it.
 */
import type { NavItemSource } from "@/lib/ui/nav";

export const proyectosNavItem: NavItemSource = {
  key: "proyectos",
  section: "items",
  order: 40,
  resolve: async () => null,
};
