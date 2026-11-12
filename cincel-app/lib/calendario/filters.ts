/** Whether the Calendario filters differ from their defaults (the "Quitar filtros" state, FE §12). Pure and client-safe. */
import type { CalendarioFilters } from "@/lib/types/calendario";

export function hasActiveCalendarioFilters(filters: CalendarioFilters): boolean {
  return (
    filters.mostrar !== "todo" ||
    filters.quien !== "yo" ||
    filters.proyectos.length > 0 ||
    Boolean(filters.tramo) ||
    Boolean(filters.responsable) ||
    !filters.apoyo ||
    filters.ocultarCompletadas
  );
}
