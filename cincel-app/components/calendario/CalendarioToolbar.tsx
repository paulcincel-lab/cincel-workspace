"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import type { CalView } from "@/lib/types/calendario";

const VIEWS: { value: CalView; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

export type CalendarioToolbarProps = {
  vista: CalView;
  rangeLabel: string;
  onVista(vista: CalView): void;
  onPrevious(): void;
  onNext(): void;
  onToday(): void;
  todayDisabled?: boolean;
  /** "Actualizar" (Google refresh with `force`); shown only when connected. */
  onRefresh?(): void;
  refreshing?: boolean;
};

/** Vista selector, Anterior / Hoy / Siguiente and the range label (FE §3). Behaviour belongs to Phase 1. */
export function CalendarioToolbar({ vista, rangeLabel, onVista, onPrevious, onNext, onToday, todayDisabled, onRefresh, refreshing }: CalendarioToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-slot="calendario-toolbar">
      <div role="group" aria-label="Vista" className="flex gap-1">
        {VIEWS.map((view) => (
          <Button key={view.value} variant={view.value === vista ? "default" : "outline"} size="sm" aria-pressed={view.value === vista} onClick={() => onVista(view.value)}>
            {view.label}
          </Button>
        ))}
      </div>
      <Button variant="outline" size="sm" aria-label="Anterior" onClick={onPrevious}>
        <ChevronLeft aria-hidden />
      </Button>
      <Button variant="outline" size="sm" onClick={onToday} disabled={todayDisabled}>
        Hoy
      </Button>
      <Button variant="outline" size="sm" aria-label="Siguiente" onClick={onNext}>
        <ChevronRight aria-hidden />
      </Button>
      <span className="text-sm text-muted-foreground">{rangeLabel}</span>
      {onRefresh ? (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Actualizando…" : "Actualizar"}
        </Button>
      ) : null}
    </div>
  );
}
