import type { ReactNode } from "react";

/**
 * One labelled row of a `SettingsSection` (redesign FE §4.11).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type SettingsRowProps = { label: string; description?: string; control: ReactNode; htmlFor?: string };

export function SettingsRow(props: SettingsRowProps) {
  void props;
  return null;
}
