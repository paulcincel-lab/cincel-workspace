/**
 * Navigation model of the new shell (redesign FE §3.1, §4.1, §21.1). Items
 * come from the registry `lib/shell/nav-items/*`; an item hides while its
 * `IMPLEMENTED` flag is false or its read action reports disabled / empty.
 *
 * Server-side: the registry files load server actions. Client components use
 * the pure helpers in `lib/ui/nav-client.ts` (icons, active item).
 */
import type { LucideIcon } from "lucide-react";

import { NAV_ITEM_SOURCES } from "@/lib/shell/nav-items";
import { listTramos, tramoColorVar } from "@/lib/tramos/compat";

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
  /** Organización entries: never resolved for a viewer who is not an administrator. */
  adminOnly?: boolean;
  resolve(session: NavSession): Promise<NavItem | null>;
};

/** Color of a tramo whose key has no chart slot. */
export const NEUTRAL_TRAMO_COLOR = "var(--muted-foreground)";

/** The nav item whose page the Tramos links open; the Tramos list follows its visibility. */
const TRAMOS_TARGET: NavItemKey = "tareas";

async function resolveSource(source: NavItemSource, session: NavSession): Promise<NavItem | null> {
  if (source.adminOnly && !session.isAdmin) return null;
  try {
    const item = await source.resolve(session);
    if (!item) return null;
    const badge =
      typeof item.badge === "number" && Number.isFinite(item.badge) && item.badge > 0 ? Math.floor(item.badge) : undefined;
    return { ...item, key: source.key, badge };
  } catch {
    // A failing read hides its entry instead of breaking every page.
    return null;
  }
}

function colorVarOf(key: string, sortOrder: number, colorSlot?: number | null): string {
  // The color an admin chose in Ajustes › Tramos y fases wins over the key / sortOrder rule.
  if (typeof colorSlot === "number" && colorSlot >= 1 && colorSlot <= 5) return `var(--chart-${colorSlot})`;
  try {
    return tramoColorVar(key, sortOrder) || NEUTRAL_TRAMO_COLOR;
  } catch {
    return NEUTRAL_TRAMO_COLOR;
  }
}

async function loadTramos(): Promise<NavModel["tramos"]> {
  try {
    const rows = await listTramos();
    return [...rows]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => ({
        key: row.key,
        name: row.name,
        colorVar: colorVarOf(row.key, row.sortOrder, row.colorSlot),
        href: `/tareas?tramo=${encodeURIComponent(row.key)}`,
      }));
  } catch {
    return [];
  }
}

/**
 * Collects every nav item source plus the Tramos list (from `listTramos`).
 * Items are ordered by `order` within their section; a source that resolves
 * null or fails is left out; admin-only sources are skipped for non-admins;
 * the Tramos list is shown only while the Tareas item it links into is.
 */
export async function buildNavModel(
  session: NavSession,
  sources: readonly NavItemSource[] = NAV_ITEM_SOURCES,
): Promise<NavModel> {
  const sorted = [...sources].sort((a, b) => a.order - b.order);
  const resolved = await Promise.all(
    sorted.map(async (source) => ({ source, item: await resolveSource(source, session) })),
  );

  const items: NavItem[] = [];
  const footer: NavItem[] = [];
  const seen = new Set<NavItemKey>();
  for (const { source, item } of resolved) {
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    (source.section === "footer" ? footer : items).push(item);
  }

  const tramos = seen.has(TRAMOS_TARGET) ? await loadTramos() : [];
  return { items, tramos, footer };
}
