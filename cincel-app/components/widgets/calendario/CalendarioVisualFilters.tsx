"use client";

import type { ReactNode } from "react";

import { HideCompletedSwitch } from "@/components/widgets/HideCompletedSwitch";
import { ProjectFilter } from "@/components/widgets/ProjectFilter";
import { etapaColorVar } from "@/lib/etapas/compat";
import type { CalMostrar } from "@/lib/types/calendario";

import { CALENDARIO_FILTER_COPY, FILTER_MOSTRAR, type CalendarioFiltersProps } from "./calendario-filters-model";
import { CalendarioSegmented } from "./CalendarioSegmented";

/** Visual filters (`Main`): Mostrar, Responsable, Proyecto, Ocultar completadas, the legend and the Mes hint (FE §3). */
export function CalendarioVisualFilters({ filters, vista, canViewTeam, projects, etapas, onChange }: CalendarioFiltersProps): ReactNode {
  const copy = CALENDARIO_FILTER_COPY;
  return (
    <section aria-label="Filtros" data-slot="calendario-filters" data-style="visual" className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CalendarioSegmented<CalMostrar>
          label={copy.mostrar}
          options={FILTER_MOSTRAR}
          value={filters.mostrar}
          onChange={(mostrar) => onChange({ mostrar })}
        />
        <CalendarioSegmented<"yo" | "todos">
          label={copy.responsable}
          options={canViewTeam ? [{ value: "yo", label: copy.yo }, { value: "todos", label: copy.todos }] : [{ value: "yo", label: copy.yo }]}
          value={canViewTeam ? filters.quien : "yo"}
          onChange={(quien) => onChange({ quien })}
        />
        <ProjectFilter options={projects} selected={filters.proyectos} onChange={(proyectos) => onChange({ proyectos })} />
        <HideCompletedSwitch checked={filters.ocultarCompletadas} onCheckedChange={(ocultarCompletadas) => onChange({ ocultarCompletadas })} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <ul aria-label={copy.legend} data-slot="calendario-legend" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {etapas.map((etapa) => (
            <li key={etapa.id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ backgroundColor: etapaColorVar(etapa.key, etapa.sortOrder) }} />
              {etapa.name}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-1 rounded-[1px] bg-muted-foreground" />
            {copy.meeting}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[2px] ring-[1.5px] ring-destructive ring-inset" />
            {copy.overdue}
          </li>
        </ul>
        {vista === "mes" ? <span data-slot="calendario-day-hint">{copy.dayHint}</span> : null}
      </div>
    </section>
  );
}
