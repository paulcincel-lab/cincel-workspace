"use client";

import { Button } from "@/components/ui/shadcn/button";
import { DASHBOARD_RANGE_WEEKS, type DashboardRange, type WidgetView } from "@/lib/stores/dashboard-store";

/**
 * Segmented controls of the Inicio widget cards (zustand.md §2.5): a group of
 * pressed / not-pressed buttons for the card's `actions` slot. UI-only; the
 * choice goes to `useInicioDashboard`.
 */
type Option<T extends string> = { value: T; label: string; ariaLabel: string };

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5">
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={pressed ? "secondary" : "ghost"}
            aria-pressed={pressed}
            aria-label={option.ariaLabel}
            onClick={() => {
              if (!pressed) onChange(option.value);
            }}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

const RANGES: readonly DashboardRange[] = ["4w", "8w", "12w"];

const RANGE_OPTIONS: readonly Option<DashboardRange>[] = RANGES.map((range) => ({
  value: range,
  label: `${DASHBOARD_RANGE_WEEKS[range]} sem`,
  ariaLabel: `${DASHBOARD_RANGE_WEEKS[range]} semanas`,
}));

/** 4 / 8 / 12 semanas. */
export function RangeControl({ value, onChange }: { value: DashboardRange; onChange(range: DashboardRange): void }) {
  return <SegmentedControl label="Rango" options={RANGE_OPTIONS} value={value} onChange={onChange} />;
}

const VIEW_OPTIONS: readonly Option<WidgetView>[] = [
  { value: "chart", label: "Gráfica", ariaLabel: "Ver como gráfica" },
  { value: "table", label: "Tabla", ariaLabel: "Ver como tabla" },
];

/** Gráfica / Tabla. */
export function ViewControl({ value, onChange }: { value: WidgetView; onChange(view: WidgetView): void }) {
  return <SegmentedControl label="Vista" options={VIEW_OPTIONS} value={value} onChange={onChange} />;
}
