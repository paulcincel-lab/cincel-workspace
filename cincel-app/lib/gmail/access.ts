/**
 * Whether a staff member's Gmail is usable (redesign BE §7.6, §8.6), from the
 * shared Google grant in `google_oauth_accounts` and the sync row in
 * `gmail_accounts` (created by the `?grant=gmail` consent):
 *
 * - `connected`: a stored token, at least one Gmail scope granted, a sync row
 *   and not disconnected (`disconnectGmailAction` keeps the token, so the flag
 *   lives on `gmail_accounts.disconnected_at`).
 * - `scopeOk`: both `gmail.readonly` and `gmail.compose` granted.
 * - `canModify`: the grant also allows label changes (`gmail.modify` or full
 *   mail access), which Gmail requires to mark a thread read on its side.
 *
 * `assertGmailAccess` throws `NOT_CONNECTED` when not connected and
 * `SCOPE_MISSING` when the scope a call needs (read or compose) is absent.
 */
import { findGmailAccountState, grantedGoogleScope, type GmailAccountState } from "@/lib/gmail/accounts";
import { GMAIL_COMPOSE_SCOPE, GMAIL_READONLY_SCOPE } from "@/lib/google/staff-oauth";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

export const GMAIL_MODIFY_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "https://mail.google.com/"];

export type GmailAccess = {
  connected: boolean;
  canRead: boolean;
  canCompose: boolean;
  canModify: boolean;
  scopeOk: boolean;
  account: GmailAccountState | null;
};

/** `scope` is the granted scope string of a stored token, or null without a token. */
export function gmailAccessFrom(scope: string | null, account: GmailAccountState | null): GmailAccess {
  const granted = new Set((scope ?? "").split(/\s+/).filter(Boolean));
  const hasToken = scope !== null;
  const canModify = hasToken && GMAIL_MODIFY_SCOPES.some((s) => granted.has(s));
  const canRead = hasToken && (granted.has(GMAIL_READONLY_SCOPE) || canModify);
  const canCompose = hasToken && granted.has(GMAIL_COMPOSE_SCOPE);
  const connected = (canRead || canCompose) && account !== null && !account.disconnectedAt;
  return { connected, canRead, canCompose, canModify, scopeOk: canRead && canCompose, account };
}

export async function loadGmailAccess(db: OwnerDb, staffId: string): Promise<GmailAccess> {
  const [scope, account] = await Promise.all([grantedGoogleScope(db, staffId), findGmailAccountState(db, staffId)]);
  return gmailAccessFrom(scope, account);
}

export function assertGmailAccess(access: GmailAccess, need: { read?: boolean; compose?: boolean }): void {
  if (!access.connected) throw new Error("NOT_CONNECTED");
  if (need.read && !access.canRead) throw new Error("SCOPE_MISSING");
  if (need.compose && !access.canCompose) throw new Error("SCOPE_MISSING");
}
