"use client";

import type { NavItem, NavItemKey } from "@/lib/ui/nav";

/**
 * Mobile tabs under 768 px (redesign FE §3.1): Inicio, Tareas, Mi espacio,
 * Proyectos and "Más" (Sheet with the rest).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type BottomTabsProps = {
  activeKey: NavItemKey | null;
  /** First 4 items. */
  items: NavItem[];
  more: NavItem[];
};

export function BottomTabs(props: BottomTabsProps) {
  void props;
  return null;
}
