"use client";

import { X } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";

import { CALENDARIO_FILTER_COPY, type CalendarioFiltersProps } from "./calendario-filters-model";
import { CalendarioSegmented } from "./CalendarioSegmented";

/**
 * Esencial filters (`Esencial`): the pills "Mi agenda" / "Todo el equipo" and
 * "Ocultar completadas". No project filter (F5): a project set by the URL shows
 * as a removable chip.
 */
export function CalendarioEsencialFilters({ filters, canViewTeam, projects, onChange }: CalendarioFiltersProps): ReactNode {
  const copy = CALENDARIO_FILTER_COPY;
  const hideId = useId();
  const chips = filters.proyectos.map((id) => ({ id, name: projects.find((p) => p.id === id)?.name ?? "1 proyecto" }));
  return (
    <section aria-label="Filtros" data-slot="calendario-filters" data-style="esencial" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <CalendarioSegmented<"yo" | "todos">
        label={copy.responsable}
        showLabel={false}
        pill
        options={canViewTeam ? [{ value: "yo", label: copy.miAgenda }, { value: "todos", label: copy.todoElEquipo }] : [{ value: "yo", label: copy.miAgenda }]}
        value={canViewTeam ? filters.quien : "yo"}
        onChange={(quien) => onChange({ quien })}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={hideId}
          checked={filters.ocultarCompletadas}
          onCheckedChange={(checked) => onChange({ ocultarCompletadas: checked === true })}
        />
        <label htmlFor={hideId} className="cursor-pointer text-sm">
          {copy.hideCompleted}
        </label>
      </div>
      {chips.map((chip) => (
        <Button
          key={chip.id}
          type="button"
          variant="outline"
          size="sm"
          data-slot="project-filter-chip"
          aria-label={`Quitar ${chip.name}`}
          className="h-7 max-w-48 gap-1 rounded-full px-2.5 text-xs"
          onClick={() => onChange({ proyectos: filters.proyectos.filter((id) => id !== chip.id) })}
        >
          <span className="truncate">{chip.name}</span>
          <X aria-hidden="true" className="size-3 shrink-0" />
        </Button>
      ))}
    </section>
  );
}
