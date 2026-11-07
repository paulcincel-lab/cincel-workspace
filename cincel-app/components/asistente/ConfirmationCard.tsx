"use client";

export type ConfirmationCardProps = {
  part: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    state: "approval-requested" | "output-available" | "output-denied" | "output-error";
    approvalId: string;
    errorText?: string;
  };
  /** Calls `addToolApprovalResponse({ id: approvalId, approved })`. */
  onRespond(approved: boolean): void;
};

/**
 * `render_confirmation` (redesign FE §3.9, §4.9): renders the native approval
 * request of a tool part; the summary is `toolSummaries[toolName](input)`
 * from `lib/assistant/tool-summaries.ts`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ConfirmationCard(props: ConfirmationCardProps) {
  void props;
  return null;
}
