"use client";

import type { CalEventItem, MeetingDraft } from "@/lib/types/calendario";

export type NewMeetingDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Edit mode when set. */
  event?: CalEventItem;
  defaults?: Partial<MeetingDraft>;
};

/** Nueva reunión (FE §6.1). Renders nothing until Phase 2 builds the form. */
export function NewMeetingDialog({ open }: NewMeetingDialogProps) {
  void open;
  return null;
}
