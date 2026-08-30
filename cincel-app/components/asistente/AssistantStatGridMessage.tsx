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
    <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {title ? (
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 bg-white p-3">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className="text-base font-semibold text-slate-800">{stat.value}</p>
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
