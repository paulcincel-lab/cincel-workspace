"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { TONE_BADGE_CLASSES, type WidgetTone } from "./tone";

type Field = { label: string; value: string };

type Props = {
  title: string;
  subtitle?: string;
  fields: Field[];
  badge?: { label: string; tone: WidgetTone };
};

/** Renders `render_card` output — status of a single entity. */
export function AssistantCardMessage({ title, subtitle, fields, badge }: Props) {
  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {badge ? (
          <Badge variant="outline" className={TONE_BADGE_CLASSES[badge.tone]}>
            {badge.label}
          </Badge>
        ) : null}
      </div>
      {fields.length > 0 ? (
        <dl className="divide-y divide-slate-100">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <dt className="text-slate-500">{f.label}</dt>
              <dd className="font-medium text-slate-800">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
