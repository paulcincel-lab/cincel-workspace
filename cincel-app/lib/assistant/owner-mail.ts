import "server-only";

import { fetchGmailStatusAction } from "@/lib/actions/gmail-actions";
import { IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

/**
 * Capability **owner-mail** of the assistant tools (redesign BE §10.1): the
 * caller's Gmail is connected (grant with the Gmail scope) and not
 * disconnected (`gmail_accounts.disconnected_at` unset, BE §7.6).
 *
 * `capability(user)` is synchronous, so the status is memoized per staff
 * member for a short time. The chat route awaits `loadOwnerMail(user)` before
 * it builds the tool set, so the first request already sees the right answer;
 * a stale or missing entry also starts a refresh in the background. The tools
 * re-check the connection on every call through the Gmail actions themselves
 * (`NOT_CONNECTED`), so a stale `true` never sends or reads mail.
 *
 * `fetchGmailStatusAction` reads the session, so the user passed here must be
 * the caller of the current request.
 */

/** How long a status stays fresh. */
export const OWNER_MAIL_TTL_MS = 60_000;

type Entry = { connected: boolean; at: number };

const memo = new Map<string, Entry>();
const inflight = new Map<string, Promise<boolean>>();

function now(): number {
  return Date.now();
}

/** Reads the caller's Gmail status and stores it. Never throws (errors → not connected). */
export async function loadOwnerMail(user: AuthenticatedUser): Promise<boolean> {
  const staffId = user.member.id;
  const running = inflight.get(staffId);
  if (running) return running;

  const task = (async () => {
    let connected = false;
    if (IMPLEMENTED.fetchGmailStatusAction) {
      try {
        const status = await fetchGmailStatusAction();
        connected = status.connected === true && status.scopeOk === true;
      } catch {
        connected = false;
      }
    }
    memo.set(staffId, { connected, at: now() });
    return connected;
  })();

  inflight.set(staffId, task);
  try {
    return await task;
  } finally {
    inflight.delete(staffId);
  }
}

/**
 * Synchronous owner-mail check for `capability(user)`: the memoized status
 * (false when unknown). A missing or stale entry starts a background refresh.
 */
export function hasOwnerMail(user: AuthenticatedUser): boolean {
  const entry = memo.get(user.member.id);
  if (!entry || now() - entry.at > OWNER_MAIL_TTL_MS) {
    void loadOwnerMail(user);
  }
  return entry?.connected ?? false;
}

/** Drops the memoized status (after a disconnect or a reconnect). */
export function forgetOwnerMail(staffId?: string): void {
  if (staffId === undefined) memo.clear();
  else memo.delete(staffId);
}
