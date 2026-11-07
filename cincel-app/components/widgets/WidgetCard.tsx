"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { Tone } from "@/lib/types/widgets";

/**
 * Card container of the widget library (redesign FE §4.10.1); extends shadcn `Card`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type WidgetCardProps = {
  title: string;
  icon?: LucideIcon;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
};

export function WidgetCard(props: WidgetCardProps) {
  void props;
  return null;
}
