"use client";

import type { CSSProperties } from "react";

import { DistributionWidget, type DistributionWidgetProps } from "@/components/widgets/DistributionWidget";
import { StyleView } from "@/components/widgets/StyleView";

/**
 * A distribution shown as a horizontal strip in Visual (redesign FE §3.5
 * "Proyectos por tramo": one flexible segment per category, flex = count,
 * tinted background, 3 px bottom border in the category color, count +
 * name). Esencial and Analítico are exactly `DistributionWidget` (text list;
 * table with totals), so the same props render the three styles.
 */
export type DistributionStripWidgetProps = DistributionWidgetProps;

/** `chart-N-tint`: the segment color mixed into `card` (FE §14.5). */
const TINT_BG =
  "bg-[color-mix(in_oklab,var(--strip-color)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--strip-color)_22%,var(--card))]";

function Strip({ title, segments, totalLabel }: DistributionStripWidgetProps) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((acc, s) => acc + s.value, 0);
  if (shown.length === 0) return null;
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
        {shown.map((segment) => (
          <li
            key={segment.key}
            data-segment={segment.key}
            className={`flex min-w-0 flex-col gap-0.5 border-b-[3px] border-(--strip-color) px-3 py-2 ${TINT_BG}`}
            style={{ flex: `${segment.value} 1 0%`, "--strip-color": segment.colorVar } as CSSProperties}
          >
            <span className="text-lg font-semibold tabular-nums text-foreground">{segment.value}</span>
            <span className="truncate text-[12.5px] text-foreground">{segment.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DistributionStripWidget(props: DistributionStripWidgetProps) {
  return (
    <StyleView
      visual={() => <Strip {...props} />}
      esencial={() => <DistributionWidget {...props} />}
      analitico={() => <DistributionWidget {...props} />}
    />
  );
}
