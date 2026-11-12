"use client";

import { useMemo, type ReactNode } from "react";

import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import { IncludeSupportSwitch } from "@/components/widgets/IncludeSupportSwitch";
import { ProjectFilter } from "@/components/widgets/ProjectFilter";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { CalMostrar } from "@/lib/types/calendario";

import { CALENDARIO_FILTER_COPY, FILTER_MOSTRAR, TRAMO_ALL, TRAMO_NONE, type CalendarioFiltersProps } from "./calendario-filters-model";

/** Analítico filters (`Analitico`): a `FilterCard` with MOSTRAR, RESPONSABLE and TRAMO, plus Proyecto and "Incluir apoyo" (FE §3). */
export function CalendarioAnaliticoFilters({ filters, canViewTeam, projects, tramos, onChange }: CalendarioFiltersProps): ReactNode {
  const copy = CALENDARIO_FILTER_COPY;
  const groups = useMemo<FilterGroup[]>(
    () => [
      { id: "mostrar", label: copy.mostrar, value: filters.mostrar, options: FILTER_MOSTRAR.map((o) => ({ ...o })) },
      {
        id: "responsable",
        label: copy.responsable,
        value: canViewTeam ? filters.quien : "yo",
        options: canViewTeam ? [{ value: "yo", label: copy.yo }, { value: "todos", label: copy.todos }] : [{ value: "yo", label: copy.yo }],
      },
      {
        id: "tramo",
        label: copy.tramo,
        value: filters.tramo ?? TRAMO_ALL,
        options: [
          { value: TRAMO_ALL, label: copy.todos },
          ...tramos.map((t) => ({ value: t.id, label: t.name, color: tramoColorVar(t.key, t.sortOrder) })),
          { value: TRAMO_NONE, label: copy.sinTramo },
        ],
      },
    ],
    [copy, filters.mostrar, filters.quien, filters.tramo, canViewTeam, tramos],
  );

  return (
    <div data-slot="calendario-filters" data-style="analitico" className="mb-4">
      <FilterCard
        groups={groups}
        onChange={(groupId, value) => {
          if (groupId === "mostrar") onChange({ mostrar: value as CalMostrar });
          else if (groupId === "responsable") onChange({ quien: value === "todos" ? "todos" : "yo" });
          else if (groupId === "tramo") onChange({ tramo: value === TRAMO_ALL ? null : value });
        }}
        extra={
          <>
            <ProjectFilter showLabel options={projects} selected={filters.proyectos} onChange={(proyectos) => onChange({ proyectos })} />
            <IncludeSupportSwitch checked={filters.apoyo} onCheckedChange={(apoyo) => onChange({ apoyo })} />
          </>
        }
      />
    </div>
  );
}
