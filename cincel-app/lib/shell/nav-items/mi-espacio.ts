/**
 * Nav item "Mi espacio" (/mi-espacio) of the new shell (redesign FE §3.1, §21.1; Phase 5).
 * `resolve` returns the item with its badge, or null while it stays hidden
 * (its `IMPLEMENTED` flag is false or its read action reports disabled / empty).
 *
 * Contract stub: hidden until Phase 5 implements it.
 */
import type { NavItemSource } from "@/lib/ui/nav";

export const miEspacioNavItem: NavItemSource = {
  key: "mi-espacio",
  section: "items",
  order: 20,
  resolve: async () => null,
};
