/**
 * Mobile navigation of the new shell (redesign FE §3.1, §4.1): below 768 px
 * the sidebar is hidden, `BottomTabs` shows Inicio, Tareas, Mi espacio and
 * Proyectos plus "Más" (a sheet with the remaining items) and a compact top
 * bar shows the page title. Pure and client-safe.
 */
import type { NavItem, NavItemKey, NavModel } from "@/lib/ui/nav";

/** Widths below this use the mobile shell (Tailwind `md`). */
export const MOBILE_BREAKPOINT = 768;

/** Media query that matches the mobile shell. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/** The four bottom tabs, in order; every other nav item goes under "Más". */
export const BOTTOM_TAB_KEYS: readonly NavItemKey[] = ["inicio", "tareas", "mi-espacio", "proyectos"];

/** Height of the bottom tab bar in px (frames `Movil*`). */
export const BOTTOM_TABS_HEIGHT = 76;

/**
 * Bottom padding for the page content under the mobile shell so the fixed
 * tab bar never covers it; removed from 768 px up.
 */
export const BOTTOM_TABS_CONTENT_CLASS = "pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0";

/** Splits the nav model into the four bottom tabs and the "Más" sheet (items, then footer). */
export function splitBottomTabs(nav: Pick<NavModel, "items" | "footer">): { items: NavItem[]; more: NavItem[] } {
  const all = [...nav.items, ...nav.footer];
  const items = BOTTOM_TAB_KEYS.flatMap((key) => all.filter((item) => item.key === key));
  const more = all.filter((item) => !BOTTOM_TAB_KEYS.includes(item.key));
  return { items, more };
}

/** Section titles of the staff routes (FE §2.1, labels of FE §13). */
const PAGE_TITLES: readonly { path: string; title: string }[] = [
  { path: "/inicio", title: "Inicio" },
  { path: "/mi-espacio", title: "Mi espacio" },
  { path: "/tareas", title: "Tareas" },
  { path: "/calendario", title: "Calendario" },
  { path: "/proyectos", title: "Proyectos" },
  { path: "/personas", title: "Personas" },
  { path: "/biblioteca", title: "Biblioteca" },
  { path: "/asistente", title: "Asistente" },
  { path: "/mejoras", title: "Mejoras" },
  { path: "/ajustes", title: "Ajustes" },
];

/** Title of the compact top bar when the route has no section title. */
export const DEFAULT_MOBILE_TITLE = "Cincel";

function ownsPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Compact top bar title for `pathname` (longest matching section wins). */
export function mobileTitleFor(pathname: string | null | undefined): string {
  if (!pathname) return DEFAULT_MOBILE_TITLE;
  let best: { title: string; length: number } | null = null;
  for (const entry of PAGE_TITLES) {
    if (!ownsPath(pathname, entry.path)) continue;
    if (!best || entry.path.length > best.length) best = { title: entry.title, length: entry.path.length };
  }
  return best?.title ?? DEFAULT_MOBILE_TITLE;
}

/** Badge text of a nav item (capped at 99+). */
export function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}
