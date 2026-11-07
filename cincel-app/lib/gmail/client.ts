/**
 * Gmail REST wrapper (redesign BE §8.6) over
 * `https://gmail.googleapis.com/gmail/v1/users/me/*`, using the staff token
 * from `google_oauth_accounts` (refresh via `lib/google/staff-token.ts`). 401 →
 * refresh once; `invalid_grant` → `NOT_CONNECTED`; 403 scope → `SCOPE_MISSING`;
 * 429 / 5xx → `RATE_LIMITED`.
 */
import { notImplemented } from "@/lib/stubs";

export type GmailApi = {
  listThreads(params: { q?: string; maxResults?: number; pageToken?: string }): Promise<unknown>;
  getThread(id: string, format: "metadata" | "full"): Promise<unknown>;
  listHistory(startHistoryId: string): Promise<unknown>;
  markThreadRead(id: string): Promise<void>;
  createDraft(raw: string, threadId?: string): Promise<{ id: string }>;
  updateDraft(draftId: string, raw: string, threadId?: string): Promise<{ id: string }>;
  sendDraft(draftId: string): Promise<{ messageId: string }>;
  getAttachment(messageId: string, attachmentId: string): Promise<{ data: Buffer; size: number }>;
};

/** A client bound to one staff member's Google token. */
export async function gmailClient(staffId: string): Promise<GmailApi> {
  return notImplemented("gmailClient", staffId);
}

/**
 * Sends the caller's draft (BE §8.6): shared by `sendGmailDraftAction` (after
 * the confirm token check) and the assistant `send_email` tool (after the AI
 * SDK approval). Contract stub.
 */
export async function sendDraft(staffId: string, draftId: string): Promise<{ messageId: string }> {
  return notImplemented("sendDraft", staffId, draftId);
}
