/**
 * Nav item "Inicio" (/inicio) of the new shell (redesign FE §3.1, §21.1; Phase 3).
 * `resolve` returns the item with its badge, or null while it stays hidden
 * (its `IMPLEMENTED` flag is false or its read action reports disabled / empty).
 *
 * Contract stub: hidden until Phase 3 implements it.
 */
import type { NavItemSource } from "@/lib/ui/nav";

export const inicioNavItem: NavItemSource = {
  key: "inicio",
  section: "items",
  order: 10,
  resolve: async () => null,
};
