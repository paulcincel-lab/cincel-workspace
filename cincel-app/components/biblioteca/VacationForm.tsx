"use client";

import type { VacationBalance, VacationRequest } from "@/lib/types/redesign";

export type VacationFormProps = { balance: VacationBalance; onSubmitted(r: VacationRequest): void };

/**
 * Vacation request form (redesign FE §3.7): Desde, Hasta, Tipo, Comentario.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function VacationForm(props: VacationFormProps) {
  void props;
  return null;
}
