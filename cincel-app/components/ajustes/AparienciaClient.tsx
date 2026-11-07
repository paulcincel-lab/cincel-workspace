"use client";

import type { OrgAppearance, UserPreferences } from "@/lib/types/redesign";

export type AparienciaClientProps = { preferences: UserPreferences; org: OrgAppearance; isAdmin: boolean };

/**
 * Ajustes › Apariencia (redesign FE §3.8): theme, style, mode, density, text
 * size, preview and the "Nuevo diseño" switch through `useAppearance`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function AparienciaClient(props: AparienciaClientProps) {
  void props;
  return null;
}
