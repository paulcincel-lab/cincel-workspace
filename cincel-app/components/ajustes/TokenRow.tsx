"use client";

import type { TokenName } from "@/lib/types/redesign";

export type TokenRowProps = { name: TokenName; label: string; value: string; onChange(hex: string): void };

/**
 * One token row of the theme editor (redesign FE §4.8); evolves
 * `PrimaryColorPicker`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function TokenRow(props: TokenRowProps) {
  void props;
  return null;
}
