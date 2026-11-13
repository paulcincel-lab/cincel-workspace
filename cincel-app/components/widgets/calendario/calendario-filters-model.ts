import type { ProjectFilterOption } from "@/components/widgets/ProjectFilter";
import type { CalView, CalendarioFilters } from "@/lib/types/calendario";
import type { WorkflowRef } from "@/lib/types/core";

/** What the three filter presentations of /calendario share (FE §3): one state, bound to the URL by the page. */
export type CalendarioFiltersProps = {
  filters: CalendarioFilters;
  vista: CalView;
  /** `canViewTeamCalendar`: without it "Todos" / "Todo el equipo" is hidden. */
  canViewTeam: boolean;
  projects: readonly ProjectFilterOption[];
  etapas: readonly WorkflowRef[];
  onChange(patch: Partial<CalendarioFilters>): void;
};

export const FILTER_MOSTRAR = [
  { value: "todo", label: "Todo" },
  { value: "tareas", label: "Tareas" },
  { value: "reuniones", label: "Reuniones" },
] as const;

/** `?etapa=none`: tasks without an etapa. */
export const ETAPA_NONE = "none";
export const ETAPA_ALL = "__todos";

export const CALENDARIO_FILTER_COPY = {
  mostrar: "Mostrar",
  responsable: "Responsable",
  etapa: "Etapa",
  yo: "Yo",
  todos: "Todos",
  miAgenda: "Mi agenda",
  todoElEquipo: "Todo el equipo",
  sinEtapa: "Sin etapa",
  hideCompleted: "Ocultar completadas",
  dayHint: "Clic en un número de día para abrir ese día",
  legend: "Leyenda",
  meeting: "Reunión (con hora)",
  overdue: "Vencida",
} as const;
