/**
 * Route-level states of the staff app (redesign FE §3, §3.12, §4.2; frames
 * `Error404`, `EstadosSistema`): copy, the loading-skeleton variant per page
 * and the not-found entry points. Pure and client-importable.
 */
import { IMPLEMENTED as SEARCH_IMPLEMENTED } from "@/lib/actions/search-actions.flags";
import type { LoadingSkeletonProps } from "@/components/shell/LoadingSkeleton";

export type LoadingVariant = LoadingSkeletonProps["variant"];

export const NOT_FOUND_COPY = {
  eyebrow: "Error 404",
  title: "No encontramos esta página",
  description:
    "Puede que el enlace esté mal escrito o que la página se haya movido. Si llegaste desde un proyecto, revisa que todavía tengas acceso.",
  home: "Volver a Inicio",
  search: "Buscar",
} as const;

export const ROUTE_ERROR_TITLE = "No se pudo cargar esta página.";

export const PERMISSION_DENIED_COPY = {
  title: "No tienes permiso para ver esta página.",
  description: "Pídele acceso a un administrador.",
} as const;

export const OFFLINE_COPY = "Sin conexión. Los cambios se guardarán cuando vuelvas a estar en línea.";

/** "Volver a Inicio". */
export const NOT_FOUND_HOME_HREF = "/inicio";

/**
 * "Buscar" opens `CommandPalette`, backed by `searchWorkspaceAction`: shown
 * only while the action is implemented (FE §9 stubs rule), hidden otherwise.
 */
export function isNotFoundSearchAvailable(
  implemented: { searchWorkspaceAction: boolean } = SEARCH_IMPLEMENTED,
): boolean {
  return implemented.searchWorkspaceAction;
}

/** Second-level pages of a project (`/proyectos/<id>/<tab>`). */
const PROJECT_TAB_VARIANTS: Record<string, LoadingVariant> = {
  tareas: "list",
  cronograma: "table",
  archivos: "table",
  clientes: "table",
  ficha: "list",
};

const PERSONAS_TABLE_TABS = new Set(["clientes", "contratistas", "proveedores"]);

/** First path segment → skeleton shape of that page (FE §3 "Loading"). */
const SEGMENT_VARIANTS: Record<string, LoadingVariant> = {
  inicio: "kpis",
  dashboard: "kpis",
  "mi-espacio": "cards",
  tareas: "list",
  "mis-tareas": "list",
  actividades: "list",
  tablero: "board",
  calendario: "calendar",
  equipo: "cards",
  directorio: "table",
  clientes: "table",
  contratistas: "table",
  proveedores: "table",
  biblioteca: "cards",
  recursos: "cards",
  ajustes: "list",
  configuracion: "list",
  profile: "list",
  asistente: "list",
};

/** The `LoadingSkeleton` variant matching the page at `pathname`. Unknown pages get `list`. */
export function loadingVariantFor(pathname: string | null | undefined): LoadingVariant {
  const segments = (pathname ?? "").split("?")[0].split("/").filter(Boolean);
  const [first, second, third] = segments;
  if (!first) return "kpis";

  if (first === "proyectos") {
    if (!second) return "cards";
    if (!third) return "kpis";
    return PROJECT_TAB_VARIANTS[third] ?? "list";
  }

  if (first === "personas") {
    if (!second) return "cards";
    if (PERSONAS_TABLE_TABS.has(second)) return "table";
    if (second === "equipo") return third ? "kpis" : "cards";
    return "list";
  }

  if (first === "biblioteca" && second === "vacaciones") return "list";

  return SEGMENT_VARIANTS[first] ?? "list";
}
