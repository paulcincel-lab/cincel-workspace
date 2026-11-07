/**
 * Nav item "Asistente" (/asistente) of the new shell (redesign FE §3.1, §21.1; Phase 7).
 * `resolve` returns the item with its badge, or null while it stays hidden
 * (its `IMPLEMENTED` flag is false or its read action reports disabled / empty).
 *
 * Contract stub: hidden until Phase 7 implements it.
 */
import type { NavItemSource } from "@/lib/ui/nav";

export const asistenteNavItem: NavItemSource = {
  key: "asistente",
  section: "items",
  order: 70,
  resolve: async () => null,
};
