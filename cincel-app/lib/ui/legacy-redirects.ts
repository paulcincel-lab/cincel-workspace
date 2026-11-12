/**
 * Old route → redesign route table (FE §2.2). Pure and client-safe; the
 * server helper that calls it is `lib/ui/legacy-redirects-server.ts`.
 *
 * Every old `page.tsx` listed in FE §2.2 is a plain redirect to the target
 * returned here (query string preserved). The canonical link forms
 * (`/tareas/[id]`, `/mi-espacio/notas/[id]`) are not part of this table.
 *
 * `/tareas?vista=` (the old Tablero / Lista / Calendario switch) redirects
 * to its Estilo: Tablero is Visual and Lista is Analítico. Calendario is its
 * own page, `/calendario`, keeping `fecha` and mapping `cal` to `vista`.
 */

/** What a Next.js page receives as `searchParams`, or a ready `URLSearchParams`. */
export type LegacySearchParams = Record<string, string | string[] | undefined> | URLSearchParams | null | undefined;

/** `/configuracion/[x]` segments renamed under `/ajustes` (FE §2.2). */
const CONFIGURACION_RENAMES: Readonly<Record<string, string>> = {
  workflows: "tramos",
  areas: "puestos",
  "importar-monday": "monday",
};

/** `/recursos/[seccion]` segments renamed under `/biblioteca` (FE §2.2). */
const RECURSOS_RENAMES: Readonly<Record<string, string>> = {
  "mis-vacaciones": "vacaciones",
};

/** Fixed old path → new path (with its own fixed query), FE §2.2. */
const STATIC_TARGETS: Readonly<Record<string, string>> = {
  "/": "/inicio",
  "/dashboard": "/inicio",
  "/tablero": "/tareas?estilo=visual",
  "/mis-tareas": "/tareas?estilo=analitico&responsable=yo",
  "/actividades/general": "/tareas?estilo=analitico",
  "/equipo": "/personas",
  "/directorio": "/personas/clientes",
  "/clientes": "/personas/clientes",
  "/contratistas": "/personas/contratistas",
  "/recursos": "/biblioteca",
  "/recursos/empresa": "/biblioteca",
  "/profile": "/ajustes/perfil",
  "/configuracion": "/ajustes/apariencia",
  "/configuracion/google/primeros-pasos": "/ajustes/google/primeros-pasos",
};

/** The old `?vista=` values and the Estilo each one opens (null: none, the viewer's own). */
const VISTA_ESTILOS: Readonly<Record<string, string | null>> = {
  tablero: "visual",
  lista: "analitico",
  calendario: null,
};

/** `/tareas` params of the removed view switch and Calendario view, dropped on the way. */
const TAREAS_OLD_PARAMS: ReadonlySet<string> = new Set(["vista", "cal", "fecha"]);

/** The old `?cal=` values and the `/calendario` `vista` each one opens. */
const CAL_VISTAS: Readonly<Record<string, string>> = {
  month: "mes",
  mes: "mes",
  week: "semana",
  semana: "semana",
  day: "dia",
  dia: "dia",
  día: "dia",
};

/** `/tareas?vista=calendario` → `/calendario`, keeping `fecha`, mapping `cal` and keeping the other params. */
function calendarioTarget(entries: [string, string][]): string {
  const query = new URLSearchParams();
  const fecha = entries.find(([key]) => key === "fecha")?.[1];
  const vista = CAL_VISTAS[entries.find(([key]) => key === "cal")?.[1] ?? ""];
  if (fecha) query.append("fecha", fecha);
  if (vista) query.append("vista", vista);
  for (const [key, value] of entries) {
    if (!TAREAS_OLD_PARAMS.has(key)) query.append(key, value);
  }
  const serialized = query.toString();
  return serialized ? `/calendario?${serialized}` : "/calendario";
}

/** `/tareas?vista=…` → the same page in its Estilo, or null when there is no `vista` param. */
function tareasVistaTarget(entries: [string, string][]): string | null {
  const vista = entries.find(([key]) => key === "vista")?.[1];
  if (vista === undefined) return null;
  if (vista === "calendario") return calendarioTarget(entries);
  const query = new URLSearchParams();
  const estilo = VISTA_ESTILOS[vista] ?? null;
  if (estilo && !entries.some(([key]) => key === "estilo")) query.append("estilo", estilo);
  for (const [key, value] of entries) {
    if (!TAREAS_OLD_PARAMS.has(key)) query.append(key, value);
  }
  const serialized = query.toString();
  return serialized ? `/tareas?${serialized}` : "/tareas";
}

function toEntries(searchParams: LegacySearchParams): [string, string][] {
  if (!searchParams) return [];
  if (searchParams instanceof URLSearchParams) return [...searchParams.entries()];
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) entries.push([key, item]);
    else entries.push([key, value]);
  }
  return entries;
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

/** Target path (with its fixed query) for an old path, or null when the path is not in FE §2.2. */
function targetFor(path: string): string | null {
  const fixed = STATIC_TARGETS[path];
  if (fixed) return fixed;

  const segments = path.split("/").filter(Boolean).map(safeDecode);
  if (segments.some((segment) => segment === null)) return null;
  const [root, first, second, ...rest] = segments as string[];
  if (!first || rest.length > 0) return null;

  switch (root) {
    case "actividades":
      if (second) return null;
      return `/tareas?${new URLSearchParams({ estilo: "analitico", tramo: first }).toString()}`;
    case "proveedores":
      return second ? null : "/personas/proveedores";
    case "recursos":
      if (first === "empresa") return second ? `/biblioteca/empresa/${encodeURIComponent(second)}` : "/biblioteca";
      if (second) return null;
      return `/biblioteca/${encodeURIComponent(RECURSOS_RENAMES[first] ?? first)}`;
    case "configuracion":
      if (second) return null;
      return `/ajustes/${encodeURIComponent(CONFIGURACION_RENAMES[first] ?? first)}`;
    default:
      return null;
  }
}

/**
 * The redesign URL an old route redirects to (FE §2.2), or
 * null when `pathname` is not a legacy route. The target's own query keys come
 * first and win over the same keys in the old query; every other old key is
 * kept in its original order. `/actividades/[tramo]?project=X` (Project Flow's
 * start deep link) also gets `iniciar=1`.
 */
export function legacyRedirectTarget(pathname: string, searchParams?: LegacySearchParams): string | null {
  const path = normalizePath(pathname);
  if (path === "/tareas") return tareasVistaTarget(toEntries(searchParams));
  const target = targetFor(path);
  if (!target) return null;

  const [targetPath, targetQuery = ""] = target.split("?", 2) as [string, string?];
  const query = new URLSearchParams(targetQuery);
  const fixedKeys = new Set(query.keys());
  const toTareas = targetPath === "/tareas";
  for (const [key, value] of toEntries(searchParams)) {
    if (fixedKeys.has(key) || (toTareas && TAREAS_OLD_PARAMS.has(key))) continue;
    query.append(key, value);
  }

  const isTramoStart = path.startsWith("/actividades/") && path !== "/actividades/general";
  if (isTramoStart && query.get("project") && !query.has("iniciar")) query.append("iniciar", "1");

  const serialized = query.toString();
  return serialized ? `${targetPath}?${serialized}` : targetPath;
}

/** Props of a legacy page that only needs its query string for the redirect. */
export type LegacyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
