/**
 * Navigation model of the new shell (redesign FE §3.1, §4.1, §21.1). Items
 * come from the registry `lib/shell/nav-items/*`; an item hides while its
 * `IMPLEMENTED` flag is false or its read action reports disabled / empty.
 */
import type { LucideIcon } from "lucide-react";

import { notImplemented } from "@/lib/stubs";

export type NavItemKey =
  | "inicio"
  | "mi-espacio"
  | "tareas"
  | "proyectos"
  | "personas"
  | "biblioteca"
  | "asistente"
  | "ajustes";

export type NavItem = { key: NavItemKey; label: string; href: string; icon: LucideIcon; badge?: number };

export type NavModel = {
  items: NavItem[];
  tramos: { key: string; name: string; colorVar: string; href: string }[];
  footer: NavItem[];
};

/** The session fields the nav model is built from (FE `AppShellProps["session"]`). */
export type NavSession = { staffId: string; name: string; role: string; isAdmin: boolean; photoUrl: string | null };

/**
 * One registry entry (`lib/shell/nav-items/<domain>.ts`). `resolve` returns
 * the item (with its badge) or null while it must stay hidden.
 */
export type NavItemSource = {
  key: NavItemKey;
  section: "items" | "footer";
  order: number;
  resolve(session: NavSession): Promise<NavItem | null>;
};

/** Collects every nav item source plus the Tramos list (from `listTramos`). */
export async function buildNavModel(session: NavSession): Promise<NavModel> {
  return notImplemented("buildNavModel", session);
}
