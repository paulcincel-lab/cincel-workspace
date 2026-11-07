"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { WidgetCard } from "@/components/widgets/WidgetCard";

import { WIDGET_TONE_BADGE_VARIANT, WIDGET_TONE_TO_TONE, type WidgetTone } from "./tone";

type Field = { label: string; value: string };

type Props = {
  title: string;
  subtitle?: string;
  fields: Field[];
  badge?: { label: string; tone: WidgetTone };
};

/**
 * `render_card` (redesign FE §3.9, §4.11.1): status of a single entity as a
 * library `WidgetCard`, which renders the user's style. The badge is the card
 * action; the fields are a label/value list.
 */
export function AssistantCardMessage({ title, subtitle, fields, badge }: Props) {
  return (
    <WidgetCard
      title={title}
      tone={badge ? WIDGET_TONE_TO_TONE[badge.tone] : undefined}
      actions={badge ? <Badge variant={WIDGET_TONE_BADGE_VARIANT[badge.tone]}>{badge.label}</Badge> : undefined}
    >
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      {fields.length > 0 ? (
        <dl className="divide-y divide-border">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3 py-2 text-sm">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="font-medium text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </WidgetCard>
  );
}
