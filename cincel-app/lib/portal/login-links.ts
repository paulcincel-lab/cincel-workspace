import "server-only";

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { portalLoginLinks, portalSessions, portalUsers } from "@/lib/db/schema";
import { hashPortalToken, newPortalToken } from "@/lib/portal/session-store";

/**
 * Single-use magic sign-in links (#506, replaces the codes of BE §B.4.2).
 * The raw token exists only in the email; `portal_login_links` keeps its
 * sha256. A link is valid 15 minutes and is consumed by one conditional
 * update, so two concurrent verifies of the same token can't both win. A new
 * link doesn't void older unused ones; each expires on its own.
 */

export const PORTAL_LOGIN_LINK_TTL_MS = 15 * 60 * 1000;
/** Rows removed per opportunistic cleanup, so one sign-in never does unbounded work. */
export const PORTAL_LOGIN_CLEANUP_LIMIT = 500;

export { hashPortalToken as hashPortalLinkToken };

export type IssuedPortalLoginLink = { token: string; email: string; name: string };

/**
 * Issues a link for `email` when it belongs to an `invited` or `active`
 * portal user. Unknown and disabled emails run the very same single
 * `insert … select` statement, which simply inserts nothing, so both paths do
 * identical work. Returns the raw token only for a known user.
 */
export async function issuePortalLoginLink(input: {
  email: string;
  returnTo: string | null;
  ip: string | null;
  now?: Date;
}): Promise<IssuedPortalLoginLink | null> {
  const token = newPortalToken();
  const tokenHash = hashPortalToken(token);
  const expiresAt = new Date((input.now ?? new Date()).getTime() + PORTAL_LOGIN_LINK_TTL_MS);

  const rows = await db.execute<{ email: string; name: string }>(sql`
    with target as (
      select id, email, name from ${portalUsers}
      where lower(email) = ${input.email.toLowerCase()} and status in ('invited', 'active')
      limit 1
    ), inserted as (
      insert into ${portalLoginLinks} (portal_user_id, token_hash, return_to, expires_at, requested_ip)
      select id, ${tokenHash}, ${input.returnTo}, ${expiresAt.toISOString()}::timestamptz, ${input.ip} from target
      returning portal_user_id
    )
    select target.email, target.name from target join inserted on inserted.portal_user_id = target.id
  `);
  const row = Array.from(rows)[0];
  return row ? { token, email: row.email, name: row.name } : null;
}

export type ConsumedPortalLoginLink = { portalUserId: string; returnTo: string | null };

/**
 * Marks the link used in one conditional update (`used_at is null and
 * expires_at > now()`), returning its user and `return_to`. Null for an
 * unknown, used or expired token. Concurrent calls with the same token: at
 * most one gets a row.
 */
export async function consumePortalLoginLink(token: string): Promise<ConsumedPortalLoginLink | null> {
  const [row] = await db
    .update(portalLoginLinks)
    .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(portalLoginLinks.tokenHash, hashPortalToken(token)),
        isNull(portalLoginLinks.usedAt),
        gt(portalLoginLinks.expiresAt, sql`now()`)
      )
    )
    .returning({ portalUserId: portalLoginLinks.portalUserId, returnTo: portalLoginLinks.returnTo });
  return row ?? null;
}

/**
 * Records the sign-in: `invited → active` (first `activated_at` kept) and
 * `last_login_at`. False when the user is `disabled` (or gone), in which case
 * no session may be created.
 */
export async function recordPortalSignIn(portalUserId: string): Promise<boolean> {
  const rows = await db
    .update(portalUsers)
    .set({
      status: "active",
      activatedAt: sql`coalesce(${portalUsers.activatedAt}, now())`,
      lastLoginAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(portalUsers.id, portalUserId), inArray(portalUsers.status, ["invited", "active"])))
    .returning({ id: portalUsers.id });
  return rows.length > 0;
}

/**
 * Opportunistic housekeeping after a successful sign-in (BE §B.3): deletes up
 * to `PORTAL_LOGIN_CLEANUP_LIMIT` used or expired links and as many expired
 * portal sessions. Never throws; it runs in `after()`.
 */
export async function cleanupPortalLoginRows(): Promise<void> {
  try {
    await db.execute(sql`
      delete from ${portalLoginLinks} where id in (
        select id from ${portalLoginLinks} where used_at is not null or expires_at <= now()
        limit ${PORTAL_LOGIN_CLEANUP_LIMIT}
      )
    `);
    await db.execute(sql`
      delete from ${portalSessions} where id in (
        select id from ${portalSessions} where expires_at <= now() limit ${PORTAL_LOGIN_CLEANUP_LIMIT}
      )
    `);
  } catch (error) {
    console.error("[portal/auth] Cleanup of login links and sessions failed", error instanceof Error ? error.name : "");
  }
}
