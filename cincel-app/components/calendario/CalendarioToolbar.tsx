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
  /** Hover / focus of Anterior (-1) or Siguiente (1): the page prefetches that range. */
  onPrefetch?(direction: -1 | 1): void;
  /** Pointer or focus left Anterior / Siguiente. */
  onPrefetchCancel?(): void;
};

/** Vista selector, Anterior / Hoy / Siguiente and the range label (FE §3). */
export function CalendarioToolbar({
  vista,
  rangeLabel,
  onVista,
  onPrevious,
  onNext,
  onToday,
  todayDisabled,
  onPrefetch,
  onPrefetchCancel,
}: CalendarioToolbarProps) {
  const hover = (direction: -1 | 1) => ({
    onMouseEnter: () => onPrefetch?.(direction),
    onFocus: () => onPrefetch?.(direction),
    onMouseLeave: () => onPrefetchCancel?.(),
    onBlur: () => onPrefetchCancel?.(),
  });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-slot="calendario-toolbar">
      <div role="group" aria-label="Vista" className="flex gap-1">
        {VIEWS.map((view) => (
          <Button key={view.value} variant={view.value === vista ? "default" : "outline"} size="sm" aria-pressed={view.value === vista} onClick={() => onVista(view.value)}>
            {view.label}
          </Button>
        ))}
      </div>
      <Button variant="outline" size="sm" aria-label="Anterior" onClick={onPrevious} {...hover(-1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <Button variant="outline" size="sm" onClick={onToday} disabled={todayDisabled}>
        Hoy
      </Button>
      <Button variant="outline" size="sm" aria-label="Siguiente" onClick={onNext} {...hover(1)}>
        <ChevronRight aria-hidden />
      </Button>
      <span aria-live="polite" className="text-sm text-muted-foreground">{rangeLabel}</span>
    </div>
  );
}
