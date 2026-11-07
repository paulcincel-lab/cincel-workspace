import type { ReactNode } from "react";

/**
 * One section of an Ajustes page (redesign FE §4.11).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type SettingsSectionProps = { title: string; description?: string; actions?: ReactNode; children: ReactNode };

export function SettingsSection(props: SettingsSectionProps) {
  void props;
  return null;
}
