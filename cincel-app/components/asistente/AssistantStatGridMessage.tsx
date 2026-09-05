"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { TONE_BADGE_CLASSES, type WidgetTone } from "./tone";

type Stat = { label: string; value: string; badge?: { label: string; tone: WidgetTone } };

type Props = {
  title?: string;
  stats: Stat[];
};

/** Renders `render_stat_grid` output — several comparable metrics at a glance. */
export function AssistantStatGridMessage({ title, stats }: Props) {
  return (
    <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {title ? (
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 bg-white p-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-base font-semibold text-foreground">{stat.value}</p>
            {stat.badge ? (
              <Badge
                variant="outline"
                className={`w-fit ${TONE_BADGE_CLASSES[stat.badge.tone]}`}
              >
                {stat.badge.label}
              </Badge>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
