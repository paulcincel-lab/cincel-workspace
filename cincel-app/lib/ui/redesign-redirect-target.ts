/**
 * New-only route → legacy route table (FE §2.3), the reverse of the FE §2.2
 * legacy table. Pure and client-safe; the flag-aware server helper that calls
 * it is `lib/ui/redesign-redirect.ts`.
 *
 * New-only routes (`/inicio`, `/mi-espacio`, `/tareas`, `/personas*`,
 * `/biblioteca*`, `/ajustes/*`) have no page in the legacy world, so with the
 * redesign flag off they send the user to the closest legacy page. A new route
 * with no legacy counterpart (Mi espacio, Apariencia, Notificaciones, …) lands
 * on `/dashboard`. Routes that exist in both worlds (`/proyectos/*`,
 * `/asistente`) and every other path return null: they never redirect.
 */

/** What a Next.js page receives as `searchParams`, or a ready `URLSearchParams`. */
export type RedesignSearchParams = Record<string, string | string[] | undefined> | URLSearchParams | null | undefined;

/** Where a new-only route without a legacy counterpart lands. */
export const LEGACY_HOME = "/dashboard";

/** `/ajustes/<segment>` → legacy page; segments missing here have no legacy page. */
const AJUSTES_TARGETS: Readonly<Record<string, string>> = {
  perfil: "/profile",
  general: "/configuracion/general",
  permisos: "/configuracion/permisos",
  puestos: "/configuracion/puestos",
  estatus: "/configuracion/estatus",
  tramos: "/configuracion/tramos",
  monday: "/configuracion/importar-monday",
  google: "/configuracion/google",
};

/** `/biblioteca/<seccion>` segments renamed back under `/recursos`. */
const BIBLIOTECA_RENAMES: Readonly<Record<string, string>> = {
  vacaciones: "mis-vacaciones",
};

function firstValue(searchParams: RedesignSearchParams, key: string): string | null {
  if (!searchParams) return null;
  if (searchParams instanceof URLSearchParams) return searchParams.get(key);
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? "";
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed === "" ? "/" : trimmed;
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** `/tareas?…` → the legacy view that shows the same tasks. */
function tareasTarget(searchParams: RedesignSearchParams): string {
  const vista = firstValue(searchParams, "vista");
  const tramo = firstValue(searchParams, "tramo");
  const responsable = firstValue(searchParams, "responsable");
  const project = firstValue(searchParams, "project");

  if (vista === "tablero") return "/tablero";
  if (vista === "calendario") return "/calendario";
  if (responsable === "yo") return "/mis-tareas";
  if (tramo) {
    const path = `/actividades/${encodeURIComponent(tramo)}`;
    return project ? `${path}?${new URLSearchParams({ project }).toString()}` : path;
  }
  if (vista === "lista") return "/actividades/general";
  return "/tablero";
}

function ajustesTarget(segments: string[]): string {
  const [segment, sub, ...rest] = segments;
  if (!segment) return LEGACY_HOME;
  if (segment === "google" && sub === "primeros-pasos" && rest.length === 0) {
    return "/configuracion/google/primeros-pasos";
  }
  return AJUSTES_TARGETS[segment] ?? LEGACY_HOME;
}

function personasTarget(segments: string[]): string {
  const [segment] = segments;
  if (!segment || segment === "equipo") return "/equipo";
  if (segment === "clientes" || segment === "contratistas" || segment === "proveedores") return "/directorio";
  return "/equipo";
}

function bibliotecaTarget(segments: string[]): string {
  const [segment, sub, ...rest] = segments;
  if (!segment || rest.length > 0) return "/recursos";
  if (segment === "empresa") return sub ? `/recursos/empresa/${encodeURIComponent(sub)}` : "/recursos/empresa";
  if (sub) return "/recursos";
  return `/recursos/${encodeURIComponent(BIBLIOTECA_RENAMES[segment] ?? segment)}`;
}

/**
 * The legacy URL a new-only route sends a flag-off user to (FE §2.3), or null
 * when `pathname` is not a new-only route (`/proyectos/*`, `/asistente`,
 * legacy paths, …) and must render as is.
 */
export function redesignRedirectTarget(pathname: string, searchParams?: RedesignSearchParams): string | null {
  const path = normalizePath(pathname);
  const decoded = path.split("/").filter(Boolean).map(safeDecode);
  if (decoded.some((segment) => segment === null)) return null;
  const [root, ...segments] = decoded as string[];

  switch (root) {
    case "inicio":
    case "mi-espacio":
      return LEGACY_HOME;
    case "tareas":
      return tareasTarget(searchParams);
    case "personas":
      return personasTarget(segments);
    case "biblioteca":
      return bibliotecaTarget(segments);
    case "ajustes":
      return ajustesTarget(segments);
    default:
      return null;
  }
}
