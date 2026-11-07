"use client";

export type GmailDraftSheetProps = {
  open: boolean;
  replyToThreadId?: string;
  to?: string[];
  subject?: string;
  onOpenChange(open: boolean): void;
};

/**
 * Reply draft (redesign FE §3.3): saves through `createGmailDraftAction` with
 * the current `draftId`; "Enviar" only after the confirmation dialog.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function GmailDraftSheet(props: GmailDraftSheetProps) {
  void props;
  return null;
}
