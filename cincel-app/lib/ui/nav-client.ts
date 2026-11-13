/**
 * Client-safe side of the nav model (redesign FE §3.1, §4.1). Icon components
 * cannot cross the server → client boundary, so the server strips them with
 * `toClientNavModel` and the client puts them back by key with `withNavIcons`.
 * The registry files (`lib/shell/nav-items/*`) use `NAV_ICONS` for their icon.
 */
import {
  BookOpen,
  CalendarDays,
  Folder,
  House,
  Inbox,
  SlidersHorizontal,
  Sparkles,
  SquareCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { isNavPathActive } from "@/components/layout/nav-active";
import type { NavItem, NavItemKey, NavModel } from "@/lib/ui/nav";

/** One lucide icon per nav item (frame `Sidebar`). */
export const NAV_ICONS: Record<NavItemKey, LucideIcon> = {
  inicio: House,
  "mi-espacio": Inbox,
  tareas: SquareCheck,
  calendario: CalendarDays,
  proyectos: Folder,
  personas: Users,
  biblioteca: BookOpen,
  asistente: Sparkles,
  ajustes: SlidersHorizontal,
};

/** Labels of the nav items (FE §13). */
export const NAV_LABELS: Record<NavItemKey, string> = {
  inicio: "Inicio",
  "mi-espacio": "Mi espacio",
  tareas: "Tareas",
  calendario: "Calendario",
  proyectos: "Proyectos",
  personas: "Personas",
  biblioteca: "Biblioteca",
  asistente: "Asistente",
  ajustes: "Ajustes",
};

export type ClientNavItem = Omit<NavItem, "icon">;
export type ClientNavModel = { items: ClientNavItem[]; etapas: NavModel["etapas"]; footer: ClientNavItem[] };

function stripIcon({ key, label, href, badge }: NavItem): ClientNavItem {
  return badge === undefined ? { key, label, href } : { key, label, href, badge };
}

/** Serializable copy of the nav model (no component references). */
export function toClientNavModel(nav: NavModel): ClientNavModel {
  return {
    items: nav.items.map(stripIcon),
    etapas: nav.etapas.map((t) => ({ ...t })),
    footer: nav.footer.map(stripIcon),
  };
}

/** The nav model with each item's icon restored from `NAV_ICONS`. */
export function withNavIcons(nav: ClientNavModel): NavModel {
  const attach = (item: ClientNavItem): NavItem => ({ ...item, icon: NAV_ICONS[item.key] });
  return { items: nav.items.map(attach), etapas: nav.etapas, footer: nav.footer.map(attach) };
}

function pathOf(href: string): string {
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

/**
 * The item whose href owns `pathname` (longest matching prefix wins, so
 * `/ajustes/perfil` lights Ajustes and `/proyectos/1/tareas` lights Proyectos).
 */
export function activeNavKey(
  pathname: string | null | undefined,
  nav: Pick<NavModel, "items" | "footer"> | Pick<ClientNavModel, "items" | "footer">,
): NavItemKey | null {
  if (!pathname) return null;
  let best: { key: NavItemKey; length: number } | null = null;
  for (const item of [...nav.items, ...nav.footer]) {
    const path = pathOf(item.href);
    if (!path || !isNavPathActive(pathname, path)) continue;
    if (!best || path.length > best.length) best = { key: item.key, length: path.length };
  }
  return best?.key ?? null;
}
