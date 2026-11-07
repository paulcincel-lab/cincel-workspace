"use client";

import type { OrgAppearance, ThemeId } from "@/lib/types/redesign";

export type ThemeEditorProps = { initial: OrgAppearance; presets: Record<ThemeId, OrgAppearance> };

/**
 * Ajustes › Tema y estilo (redesign FE §3.8): org theme editor with live
 * preview and `ContrastBadge`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ThemeEditor(props: ThemeEditorProps) {
  void props;
  return null;
}
