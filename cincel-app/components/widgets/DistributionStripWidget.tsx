"use client";

import type { CSSProperties } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { DistributionWidget, type DistributionWidgetProps } from "@/components/widgets/DistributionWidget";
import { StyleView } from "@/components/widgets/StyleView";
import type { WidgetView } from "@/lib/stores/dashboard-store";
import { cn } from "@/lib/utils";

/**
 * A distribution shown as a horizontal strip in Visual (redesign FE §3.5
 * "Proyectos por etapa": one flexible segment per category, flex = count,
 * tinted background, 3 px bottom border in the category color, count +
 * name). Esencial and Analítico are exactly `DistributionWidget` (text list;
 * table with totals), so the same props render the three styles.
 *
 * Opt-in dashboard props (zustand.md §2.5); without them the widget renders
 * as above:
 * - `onSelect` (+ `selectedKey`): segments become toggle buttons
 *   (`aria-pressed`); pressing the selected one again hands back its key so
 *   the page can clear it. Where `DistributionWidget` draws the data, a row
 *   of segment toggles under it carries the same selection.
 * - `view`: "chart" = the strip in Visual, the `DistributionWidget` list in
 *   Esencial and its donut in Analítico; "table" = the `DistributionWidget`
 *   table in every style.
 */
export type DistributionStripWidgetProps = DistributionWidgetProps & {
  /** The selected segment key (pressed), or null. */
  selectedKey?: string | null;
  /** Makes the segments toggle buttons; called with the pressed segment's key. */
  onSelect?: (key: string) => void;
  /** Chart/table override; without it the presentation style decides. */
  view?: WidgetView;
};

/** `chart-N-tint`: the segment color mixed into `card` (FE §14.5). */
const TINT_BG =
  "bg-[color-mix(in_oklab,var(--strip-color)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--strip-color)_22%,var(--card))]";

const SEGMENT_CLASS = `flex min-w-0 flex-col gap-0.5 border-b-[3px] border-(--strip-color) px-3 py-2 ${TINT_BG}`;

type Selection = { selectedKey: string | null; onSelect?: (key: string) => void };

function SegmentBody({ value, label }: { value: number; label: string }) {
  return (
    <>
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
      <span className="truncate text-[12.5px] text-foreground">{label}</span>
    </>
  );
}

function Strip({ title, segments, totalLabel, selectedKey, onSelect }: DistributionWidgetProps & Selection) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((acc, s) => acc + s.value, 0);
  if (shown.length === 0) return null;
  const hasSelection = selectedKey !== null && shown.some((s) => s.key === selectedKey);
  return (
    <section aria-label={title} data-slot="distribution-strip" className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium text-muted-foreground">
        {title}
        <span className="sr-only">
          {" "}
          · {total} {totalLabel ?? ""}
        </span>
      </h2>
      <ul className="flex min-w-0 gap-1.5 overflow-hidden rounded-xl">
        {shown.map((segment) => {
          const style = { flex: `${segment.value} 1 0%`, "--strip-color": segment.colorVar } as CSSProperties;
          if (!onSelect) {
            return (
              <li key={segment.key} data-segment={segment.key} className={SEGMENT_CLASS} style={style}>
                <SegmentBody value={segment.value} label={segment.label} />
              </li>
            );
          }
          const pressed = segment.key === selectedKey;
          return (
            <li key={segment.key} data-segment={segment.key} className="flex min-w-0" style={style}>
              <button
                type="button"
                aria-pressed={pressed}
                data-selected={pressed || undefined}
                onClick={() => onSelect(segment.key)}
                className={cn(
                  SEGMENT_CLASS,
                  "w-full cursor-pointer text-left outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50",
                  pressed && "border-b-[5px]",
                  hasSelection && !pressed && "opacity-60",
                )}
              >
                <SegmentBody value={segment.value} label={segment.label} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Segment toggles for the branches where `DistributionWidget` draws the data. */
function SegmentToggles({ title, segments, selectedKey, onSelect }: DistributionWidgetProps & Selection) {
  const shown = segments.filter((s) => s.value > 0);
  if (!onSelect || shown.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={`Filtrar: ${title}`}
      data-slot="distribution-strip-toggles"
      className="flex flex-wrap gap-1.5"
    >
      {shown.map((segment) => {
        const pressed = segment.key === selectedKey;
        return (
          <Button
            key={segment.key}
            type="button"
            size="sm"
            variant={pressed ? "secondary" : "outline"}
            aria-pressed={pressed}
            data-segment={segment.key}
            onClick={() => onSelect(segment.key)}
          >
            {segment.label}
            <span className="tabular-nums text-muted-foreground">{segment.value}</span>
          </Button>
        );
      })}
    </div>
  );
}

/** `DistributionWidget` (with `view` when given) and, when selectable, the segment toggles under it. */
function Distribution({ view, selectedKey, onSelect, ...props }: DistributionWidgetProps & Selection & { view?: WidgetView }) {
  const widget = view === undefined ? <DistributionWidget {...props} /> : <DistributionWidget {...props} view={view} />;
  if (!onSelect) return widget;
  return (
    <div className="flex flex-col gap-2">
      {widget}
      <SegmentToggles {...props} selectedKey={selectedKey} onSelect={onSelect} />
    </div>
  );
}

export function DistributionStripWidget({ selectedKey = null, onSelect, view, ...props }: DistributionStripWidgetProps) {
  const selection: Selection = { selectedKey, onSelect };
  if (view === "table") return <Distribution {...props} {...selection} view="table" />;
  return (
    <StyleView
      visual={() => <Strip {...props} {...selection} />}
      // "chart" in Esencial is the `DistributionWidget` list, as without a view.
      esencial={() => <Distribution {...props} {...selection} />}
      // "chart" in Analítico is the `DistributionWidget` donut; without a view it stays the table.
      analitico={() => <Distribution {...props} {...selection} view={view === "chart" ? "chart" : undefined} />}
    />
  );
}
