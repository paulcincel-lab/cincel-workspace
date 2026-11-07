"use client";

import type { ReactNode } from "react";

/**
 * Filters row (redesign FE §4.11): chips with `aria-pressed` and URL hrefs,
 * selects and search. Extends `TaskMemberProjectFilters`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type FiltersBarProps = {
  chips?: { key: string; label: string; count?: number; colorVar?: string; pressed: boolean; href: string }[];
  selects?: ReactNode[];
  search?: { value: string; placeholder: string; onChange(v: string): void };
};

export function FiltersBar(props: FiltersBarProps) {
  void props;
  return null;
}
