/**
 * Menu visibility (Ajustes › Menú): the organization setting `nav_visibility`
 * holds the keys of the menu elements an administrator hid. Pure and
 * client-safe; the server read lives in `nav-visibility-server.ts`.
 */
import type { NavItemKey } from "@/lib/ui/nav";

export const NAV_VISIBILITY_SETTING_KEY = "nav_visibility";

/** Every nav item key, in sidebar order. */
export const NAV_ITEM_KEYS: readonly NavItemKey[] = [
  "inicio",
  "mi-espacio",
  "tareas",
  "calendario",
  "proyectos",
  "personas",
  "biblioteca",
  "asistente",
  "mejoras",
  "ajustes",
];

export const NAV_SEARCH_KEY = "search";
export const NAV_JORNADA_KEY = "jornada";
export const NAV_ETAPAS_KEY = "etapas";
export const NAV_TAREAS_SUBMENU_KEY = "tareas:proyectos";
export const NAV_PROYECTOS_SUBMENU_KEY = "proyectos:lista";

/** The key that hides one etapa. */
export function etapaVisibilityKey(etapaKey: string): string {
  return `etapa:${etapaKey}`;
}

/** Fixed keys every stored value may use (etapa keys are checked separately). */
const FIXED_KEYS: ReadonlySet<string> = new Set<string>([
  ...NAV_ITEM_KEYS,
  NAV_SEARCH_KEY,
  NAV_JORNADA_KEY,
  NAV_ETAPAS_KEY,
  NAV_TAREAS_SUBMENU_KEY,
  NAV_PROYECTOS_SUBMENU_KEY,
]);

/** Ajustes can never be hidden, so an administrator can always reach this page. */
export const NAV_LOCKED_KEY: NavItemKey = "ajustes";

export type NavVisibility = { version: 1; hidden: string[] };

export const DEFAULT_NAV_VISIBILITY: NavVisibility = { version: 1, hidden: [] };

function isValidKey(key: string, etapaKeys: ReadonlySet<string> | null): boolean {
  if (key === NAV_LOCKED_KEY) return false;
  if (FIXED_KEYS.has(key)) return true;
  if (!key.startsWith("etapa:")) return false;
  const etapa = key.slice("etapa:".length);
  if (etapa.trim() === "") return false;
  return etapaKeys === null || etapaKeys.has(etapa);
}

/**
 * The valid, de-duplicated keys of `candidate` (anything that is not an array
 * of strings gives none). Unknown keys and Ajustes are dropped; with
 * `etapaKeys` an `etapa:<key>` of a deleted etapa is dropped too.
 */
export function sanitizeHiddenKeys(candidate: unknown, etapaKeys: ReadonlySet<string> | null = null): string[] {
  if (!Array.isArray(candidate)) return [];
  const out: string[] = [];
  for (const value of candidate) {
    if (typeof value !== "string") continue;
    const key = value.trim();
    if (!isValidKey(key, etapaKeys) || out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

/** Parses the stored JSON value; anything malformed gives the default (nothing hidden). */
export function parseNavVisibility(raw: string | null | undefined): NavVisibility {
  if (!raw) return { ...DEFAULT_NAV_VISIBILITY, hidden: [] };
  try {
    const payload = JSON.parse(raw) as { version?: unknown; hidden?: unknown } | null;
    if (!payload || typeof payload !== "object" || payload.version !== 1) {
      return { ...DEFAULT_NAV_VISIBILITY, hidden: [] };
    }
    return { version: 1, hidden: sanitizeHiddenKeys(payload.hidden) };
  } catch {
    return { ...DEFAULT_NAV_VISIBILITY, hidden: [] };
  }
}

/** True when `key` is not in the hidden list. */
export function isNavKeyVisible(hidden: readonly string[] | undefined, key: string): boolean {
  return !hidden?.includes(key);
}
