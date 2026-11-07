"use client";

import type { ReactNode } from "react";

import { WidgetCard } from "@/components/widgets/WidgetCard";

/**
 * An Inicio widget with no data (redesign FE §3.2 "Empty"): the widget's card
 * with one line of copy, the same in every style (the card itself follows the
 * style).
 */
export function EmptyWidgetCard({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <WidgetCard title={title}>
      <p className="text-sm text-muted-foreground">{text}</p>
      {children}
    </WidgetCard>
  );
}
