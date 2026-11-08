"use client";

import Link from "next/link";

import { StyleView } from "@/components/widgets/StyleView";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import type { PersonaActivityItem } from "@/lib/types/redesign";

export type ActivityFeedWidgetProps = {
  title: string;
  /** Title of the empty state shown when `items` is empty. */
  emptyTitle: string;
  items: PersonaActivityItem[];
};

/**
 * Activity feed card (frames `PersonaDetalle`, `PersonaDetalleEsencial`):
 * Visual rows with a dot, the sentence and the mono time; Esencial rows with
 * the sentence over the time. The Analítico frame has no activity card, so
 * Analítico renders nothing.
 */
export function ActivityFeedWidget({ title, emptyTitle, items }: ActivityFeedWidgetProps) {
  const emptyState = { title: emptyTitle };
  return (
    <StyleView
      visual={() => (
        <WidgetCard title={title} emptyState={emptyState}>
          {items.length > 0 ? (
            <ul className="flex flex-col" data-testid="recent-activity">
              {items.map((item) => (
                <li key={item.id} className="flex gap-2.5 border-t border-border py-2 text-[13px]">
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                  <Link href={item.href} className="min-w-0 flex-1 text-foreground hover:underline">
                    {item.text}
                  </Link>
                  <time dateTime={item.at} className="font-mono text-[11.5px] whitespace-nowrap text-muted-foreground">
                    {item.when}
                  </time>
                </li>
              ))}
            </ul>
          ) : null}
        </WidgetCard>
      )}
      esencial={() => (
        <WidgetCard title={title} emptyState={emptyState}>
          {items.length > 0 ? (
            <ul className="flex flex-col" data-testid="recent-activity">
              {items.map((item) => (
                <li key={item.id} className="flex min-w-0 flex-col gap-[3px] border-t border-border py-3">
                  <Link href={item.href} className="text-[15px] text-foreground hover:underline">
                    {item.text}
                  </Link>
                  <time dateTime={item.at} className="text-[13px] text-muted-foreground">
                    {item.when}
                  </time>
                </li>
              ))}
            </ul>
          ) : null}
        </WidgetCard>
      )}
      analitico={() => null}
    />
  );
}
