"use client";

import type { TypeRole } from "@/lib/types/redesign";

export type TypeScaleRowProps = {
  role: TypeRole;
  label: string;
  value: { size: number; weight: 400 | 500 | 600 };
  min: number;
  max: number;
  onChange(v: { size: number; weight: 400 | 500 | 600 }): void;
};

/**
 * One type role row of the theme editor (redesign FE §4.8).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function TypeScaleRow(props: TypeScaleRowProps) {
  void props;
  return null;
}
