import "server-only";

import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { recordDirectoryError } from "@/lib/auth/directory-error-log";
import {
  applyAccess,
  evaluateAccess,
  type EvaluateAccessOptions,
  type WorkspaceAccessDenialReason,
} from "@/lib/auth/workspace-access";
import { db } from "@/lib/db/client";
import { authEvents, sessions, staff } from "@/lib/db/schema";
import { DirectoryError } from "@/lib/google/directory";

/**
 * Periodic access re-check (BE §A.5). Every ACCESS_RECHECK_HOURS the first
 * request of a Google-linked staff member claims the check with a conditional
 * update of `access_checked_at`; only the claimer calls the Directory.
 *
 * - still allowed: role and áreas are refreshed (`applyAccess`)
 * - not allowed: `access_revoked_*` set, every session deleted, `auth_events`
 * - Directory error (or not configured): access is kept and the next check
 *   runs 5 minutes later, persisted in `access_checked_at`
 *
 * Staff without `google_sub` (password-only, e.g. the bootstrap admin) are
 * never re-checked.
 */

export const DEFAULT_ACCESS_RECHECK_HOURS = 4;
export const RECHECK_BACKOFF_MS = 5 * 60_000;

type Env = Record<string, string | undefined>;

/** `ACCESS_RECHECK_HOURS` as a positive number of hours; unset or invalid values give the default (4). */
export function accessRecheckHours(env: Env = process.env): number {
  const raw = env.ACCESS_RECHECK_HOURS?.trim();
  if (!raw) return DEFAULT_ACCESS_RECHECK_HOURS;
  const hours = Number(raw);
  return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_ACCESS_RECHECK_HOURS;
}

/** Whether a check last claimed at `checkedAt` is due again. */
export function isAccessCheckDue(checkedAt: Date | null, hours: number, now: Date = new Date()): boolean {
  return checkedAt === null || now.getTime() - checkedAt.getTime() >= hours * 3_600_000;
}

export type AccessRecheckOutcome =
  | { status: "not_google_linked" }
  /** Not due, or another request claimed it first. */
  | { status: "not_claimed" }
  | { status: "kept" }
  | { status: "revoked"; reason: WorkspaceAccessDenialReason }
  | { status: "error"; error: DirectoryError };

export type AccessRecheckOptions = Pick<EvaluateAccessOptions, "directory" | "mappings"> & {
  /** Ignore the interval (Revisar acceso ahora). */
  force?: boolean;
  /** Defaults to `accessRecheckHours()`. */
  hours?: number;
};

/**
 * `update … set access_checked_at = now() where … returning id`: true only for
 * the request that gets the row back. With `force` the interval is ignored.
 */
async function claimCheck(staffId: string, hours: number, force: boolean): Promise<boolean> {
  const due = or(
    isNull(staff.accessCheckedAt),
    lt(staff.accessCheckedAt, sql`now() - make_interval(secs => ${hours * 3600}::double precision)`),
  );
  const rows = await db
    .update(staff)
    .set({ accessCheckedAt: sql`now()` })
    .where(and(eq(staff.id, staffId), isNull(staff.deletedAt), isNotNull(staff.googleSub), force ? undefined : due))
    .returning({ id: staff.id });
  return rows.length > 0;
}

/** Back off: the next check becomes due 5 minutes from now, which survives restarts. */
async function backOff(staffId: string, hours: number): Promise<void> {
  const secondsAgo = Math.max(0, hours * 3600 - RECHECK_BACKOFF_MS / 1000);
  await db
    .update(staff)
    .set({ accessCheckedAt: sql`now() - make_interval(secs => ${secondsAgo}::double precision)` })
    .where(eq(staff.id, staffId));
}

/** Marks the access revoked, deletes every session and records `staff_recheck_revoked`. */
async function revoke(staffId: string, email: string | null, reason: WorkspaceAccessDenialReason): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({ accessRevokedAt: new Date(), accessRevokedReason: reason })
      .where(eq(staff.id, staffId));
    await tx.delete(sessions).where(eq(sessions.staffId, staffId));
    await tx.insert(authEvents).values({ kind: "staff_recheck_revoked", staffId, email, reason });
  });
}

/**
 * Re-checks one staff member against Workspace. Without `force` it does
 * nothing unless this call claims a due check.
 */
export async function recheckStaffAccess(
  staffId: string,
  options: AccessRecheckOptions = {},
): Promise<AccessRecheckOutcome> {
  const hours = options.hours ?? accessRecheckHours();
  const [row] = await db
    .select({ googleSub: staff.googleSub, email: staff.email })
    .from(staff)
    .where(and(eq(staff.id, staffId), isNull(staff.deletedAt)))
    .limit(1);
  if (!row?.googleSub) return { status: "not_google_linked" };

  if (!(await claimCheck(staffId, hours, options.force === true))) return { status: "not_claimed" };

  let result;
  try {
    result = await evaluateAccess(row.googleSub, row.email ?? "", {
      directory: options.directory,
      mappings: options.mappings,
    });
  } catch (error) {
    if (!(error instanceof DirectoryError)) throw error;
    console.error(`[access-recheck] Directory error (${error.kind}${error.status ? ` ${error.status}` : ""})`);
    await backOff(staffId, hours);
    await recordDirectoryError("recheck", error, { staffId, email: row.email });
    return { status: "error", error };
  }

  if (!result.allowed) {
    await revoke(staffId, row.email, result.reason);
    return { status: "revoked", reason: result.reason };
  }

  await applyAccess(staffId, result);
  await db.insert(authEvents).values({ kind: "staff_recheck_kept", staffId, email: row.email });
  return { status: "kept" };
}
