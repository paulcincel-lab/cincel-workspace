"use client";

export type QuickCaptureProps = { onCreated(kind: "nota" | "checklist" | "recordatorio"): void };

/**
 * Quick capture (redesign FE §3.3): "- [ ]" → checklist, parsed `dueAt` →
 * `ReminderDialog`, otherwise a note.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function QuickCapture(props: QuickCaptureProps) {
  void props;
  return null;
}
