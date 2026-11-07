"use client";

import type { FormSheetProps } from "./FormSheet";

/**
 * `Dialog` form shell (redesign FE §4.11): the `FormSheet` props on a dialog;
 * `dismissible: false` disables Escape and outside click (required
 * `ClockInPrompt`).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type FormDialogProps = FormSheetProps & { dismissible?: boolean };

export function FormDialog(props: FormDialogProps) {
  void props;
  return null;
}
