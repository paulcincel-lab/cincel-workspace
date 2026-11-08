"use client";

import { useStyle } from "@/components/shell/StyleProvider";
import { Button } from "@/components/ui/shadcn/button";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import { usePersonasDashboard, type PersonasWidget } from "@/lib/stores/personas-dashboard-store";

export type PersonasViewToggleProps = {
  widget: PersonasWidget;
  /** The view the widget renders now (`useWidgetView`). */
  view: WidgetView;
  /** Accessible name of the group, e.g. "Vista del equipo". */
  label: string;
  /** Label of the "chart" option (e.g. "Cuadrícula", "Tarjetas"). */
  chartLabel: string;
};

/**
 * Chart / table switch of a Personas widget. The pick is stored for the
 * active presentation style only, so choosing "Tabla" in Visual leaves
 * Esencial and Analítico as they were. Pure UI state: no server call.
 */
export function PersonasViewToggle({ widget, view, label, chartLabel }: PersonasViewToggleProps) {
  const { style } = useStyle();
  const setWidgetView = usePersonasDashboard((s) => s.setWidgetView);
  const options: { value: WidgetView; label: string }[] = [
    { value: "chart", label: chartLabel },
    { value: "table", label: "Tabla" },
  ];
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={view === option.value ? "secondary" : "ghost"}
          aria-pressed={view === option.value}
          onClick={() => setWidgetView(style, widget, option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
