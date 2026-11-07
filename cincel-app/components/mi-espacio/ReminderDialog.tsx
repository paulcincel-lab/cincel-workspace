"use client";

import type { ParsedReminder, Reminder } from "@/lib/types/redesign";

export type ReminderDialogProps = {
  open: boolean;
  initialText?: string;
  parsed?: ParsedReminder;
  onOpenChange(open: boolean): void;
  onCreated(r: Reminder): void;
};

/**
 * New reminder dialog (redesign FE §3.3) on `FormDialog`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ReminderDialog(props: ReminderDialogProps) {
  void props;
  return null;
}
