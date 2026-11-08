"use client";

import type { ReactNode } from "react";

import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useInicioCollapsible, type InicioWidget } from "@/lib/stores/inicio-dashboard-store";

/**
 * An Inicio widget with no data (redesign FE §3.2 "Empty"): the widget's card
 * with one line of copy, the same in every style (the card itself follows the
 * style). It collapses like the widget it stands in for (`widget`).
 */
export function EmptyWidgetCard({
  widget,
  title,
  text,
  children,
}: {
  widget: InicioWidget;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  const collapsible = useInicioCollapsible(widget);
  return (
    <WidgetCard title={title} collapsible={collapsible}>
      <p className="text-sm text-muted-foreground">{text}</p>
      {children}
    </WidgetCard>
  );
}
