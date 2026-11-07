"use client";

import type { ReactNode } from "react";

import type { PersonDatum } from "@/lib/types/widgets";

/**
 * People in three styles (redesign FE §4.10.1): cards / availability grid,
 * directory list, or occupancy table.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type PeopleWidgetProps = {
  people: PersonDatum[];
  show: ("load" | "hours" | "availability" | "projects")[];
  layout?: "cards" | "rows";
  actions?: (p: PersonDatum) => ReactNode;
};

export function PeopleWidget(props: PeopleWidgetProps) {
  void props;
  return null;
}
