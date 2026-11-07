"use client";

import type { PersonaDetail as PersonaDetailData } from "@/lib/types/redesign";

export type PersonaDetailProps = { detail: PersonaDetailData };

/**
 * Persona detalle (redesign FE §3.6, §4.7): `KpiWidget`, `ProgressListWidget`,
 * `AttentionListWidget` and a single-row `PeopleWidget`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function PersonaDetail(props: PersonaDetailProps) {
  void props;
  return null;
}
