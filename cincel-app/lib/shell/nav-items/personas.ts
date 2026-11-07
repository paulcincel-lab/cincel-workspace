/**
 * Nav item "Personas" (/personas) of the new shell (redesign FE §3.1, §21.1; Phase 4).
 * `resolve` returns the item with its badge, or null while it stays hidden
 * (its `IMPLEMENTED` flag is false or its read action reports disabled / empty).
 *
 * Contract stub: hidden until Phase 4 implements it.
 */
import type { NavItemSource } from "@/lib/ui/nav";

export const personasNavItem: NavItemSource = {
  key: "personas",
  section: "items",
  order: 50,
  resolve: async () => null,
};
