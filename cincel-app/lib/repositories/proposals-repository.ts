/**
 * `assistant_proposals` (Calendario BE §3.6, §6.3, ADR 0007). Server-only.
 * Only the owner (`staff_id`) can see, apply or undo a proposal.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, inArray, lt } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { db } from "@/lib/db/client";
import { assistantProposals, tasks } from "@/lib/db/schema";
import { MAX_PROPOSAL_CHANGES, PROPOSAL_TTL_HOURS } from "@/lib/calendario/proposals";
import { getEventItem } from "@/lib/repositories/calendar-events-repository";
import type { AppliedChange, DeferredItem, Proposal, ProposalChange, ProposalKind, ProposalStatus } from "@/lib/types/calendario";

type ProposalRow = typeof assistantProposals.$inferSelect;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Rows older than this are deleted by the daily cron. */
export const PROPOSAL_RETENTION_DAYS = 90;

/** The row as the client sees it (no token, no applied log). */
function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    line: row.line,
    rangeFrom: row.rangeFrom,
    rangeTo: row.rangeTo,
    changes: row.changes,
    deferred: row.deferred,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** What apply and undo read: the proposal plus the server-only fields. */
export type ProposalRecord = {
  proposal: Proposal;
  staffId: string;
  applied: AppliedChange[];
  undoExpiresAt: Date | null;
  expiresAt: Date;
};

function toRecord(row: ProposalRow): ProposalRecord {
  return { proposal: toProposal(row), staffId: row.staffId, applied: row.applied, undoExpiresAt: row.undoExpiresAt, expiresAt: row.expiresAt };
}

/** sha-256 hex of an undo token, the only form stored (like `calendar_feed_tokens`). */
export function hashUndoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh random undo token (32 bytes, hex). */
export function newUndoToken(): string {
  return randomBytes(32).toString("hex");
}

/** Reads the current value each `before` stands for, inside the create call. */
async function withCurrentBefore(changes: ProposalChange[], user: AuthenticatedUser): Promise<ProposalChange[]> {
  const taskIds = changes.flatMap((c) => (c.type === "task_date" ? [c.taskId] : []));
  const dates = new Map<string, { commitmentDate: string | null; deliveryDate: string | null }>();
  if (taskIds.length > 0) {
    const rows = await db
      .select({ id: tasks.id, commitmentDate: tasks.commitmentDate, deliveryDate: tasks.deliveryDate })
      .from(tasks)
      .where(inArray(tasks.id, taskIds));
    for (const row of rows) dates.set(row.id, row);
  }
  const out: ProposalChange[] = [];
  for (const change of changes) {
    if (change.type === "task_date") {
      const row = dates.get(change.taskId);
      out.push(row ? { ...change, before: { field: change.before.field, date: row[change.before.field] } } : change);
    } else if (change.type === "event_update") {
      const event = await getEventItem(user, change.eventId);
      if (!event) {
        out.push(change);
        continue;
      }
      const current: Record<string, unknown> = { title: event.title, start: event.start, end: event.end, location: event.location };
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(change.after)) {
        if (key in current) before[key] = current[key];
        else if (key in change.before) before[key] = (change.before as Record<string, unknown>)[key];
      }
      out.push({ ...change, before });
    } else {
      out.push(change);
    }
  }
  return out;
}

/** Writes the row; `before` values are read inside the same call. */
export async function createProposal(
  user: AuthenticatedUser,
  kind: ProposalKind,
  data: {
    title: string;
    line: string;
    changes: ProposalChange[];
    deferred: DeferredItem[];
    range: { from: string; to: string } | null;
  },
  opts?: { threadId?: string; toolCallId?: string },
): Promise<Proposal> {
  if (data.changes.length === 0 || data.changes.length > MAX_PROPOSAL_CHANGES) throw new Error("INVALID: changes");
  const changes = await withCurrentBefore(data.changes, user);
  const now = Date.now();
  const [row] = await db
    .insert(assistantProposals)
    .values({
      staffId: user.member.id,
      threadId: opts?.threadId ?? null,
      toolCallId: opts?.toolCallId ?? null,
      kind,
      title: data.title,
      line: data.line,
      rangeFrom: data.range?.from ?? null,
      rangeTo: data.range?.to ?? null,
      changes,
      deferred: data.deferred,
      expiresAt: new Date(now + PROPOSAL_TTL_HOURS * HOUR_MS),
    })
    .returning();
  return toProposal(row);
}

/** Null for a proposal of another person. */
export async function getProposal(user: AuthenticatedUser, id: string): Promise<Proposal | null> {
  const record = await getProposalRecord(user, id);
  return record?.proposal ?? null;
}

/** The owner's proposal with its server-only fields; null for anyone else's. */
export async function getProposalRecord(user: AuthenticatedUser, id: string): Promise<ProposalRecord | null> {
  const [row] = await db
    .select()
    .from(assistantProposals)
    .where(and(eq(assistantProposals.id, id), eq(assistantProposals.staffId, user.member.id)))
    .limit(1);
  return row ? toRecord(row) : null;
}

/** The owner's most recent proposals, newest first. */
export async function listRecentProposals(user: AuthenticatedUser, limit = 20): Promise<Proposal[]> {
  const rows = await db
    .select()
    .from(assistantProposals)
    .where(eq(assistantProposals.staffId, user.member.id))
    .orderBy(desc(assistantProposals.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map(toProposal);
}

/** Owner only: an open proposal becomes `cancelada`. FORBIDDEN for anyone else, STALE once it is not open. */
export async function cancelProposal(user: AuthenticatedUser, id: string): Promise<{ id: string }> {
  const record = await getProposalRecord(user, id);
  if (!record) throw new Error("FORBIDDEN");
  if (record.proposal.status !== "propuesta") throw new Error("STALE");
  const rows = await db
    .update(assistantProposals)
    .set({ status: "cancelada" })
    .where(and(eq(assistantProposals.id, id), eq(assistantProposals.status, "propuesta")))
    .returning({ id: assistantProposals.id });
  if (rows.length === 0) throw new Error("STALE");
  return { id };
}

export async function setProposalStatus(
  id: string,
  status: ProposalStatus,
  patch?: {
    applied?: AppliedChange[];
    undoTokenHash?: string | null;
    undoExpiresAt?: Date | null;
    appliedAt?: Date | null;
    undoneAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(assistantProposals)
    .set({
      status,
      ...(patch?.applied !== undefined ? { applied: patch.applied } : {}),
      ...(patch?.undoTokenHash !== undefined ? { undoToken: patch.undoTokenHash } : {}),
      ...(patch?.undoExpiresAt !== undefined ? { undoExpiresAt: patch.undoExpiresAt } : {}),
      ...(patch?.appliedAt !== undefined ? { appliedAt: patch.appliedAt } : {}),
      ...(patch?.undoneAt !== undefined ? { undoneAt: patch.undoneAt } : {}),
    })
    .where(eq(assistantProposals.id, id));
}

/**
 * Closes an open proposal as applied (`aplicada` | `parcial`) in one conditional update.
 * False when it was no longer `propuesta` (a concurrent apply won).
 */
export async function markApplied(
  id: string,
  status: "aplicada" | "parcial",
  data: { applied: AppliedChange[]; undoTokenHash: string; undoExpiresAt: Date; appliedAt: Date },
): Promise<boolean> {
  const rows = await db
    .update(assistantProposals)
    .set({
      status,
      applied: data.applied,
      undoToken: data.undoTokenHash,
      undoExpiresAt: data.undoExpiresAt,
      appliedAt: data.appliedAt,
    })
    .where(and(eq(assistantProposals.id, id), eq(assistantProposals.status, "propuesta")))
    .returning({ id: assistantProposals.id });
  return rows.length > 0;
}

/** The owner's proposal for an undo token (hashed lookup); null for anyone else's. */
export async function findRecordByUndoToken(user: AuthenticatedUser, undoToken: string): Promise<ProposalRecord | null> {
  const [row] = await db
    .select()
    .from(assistantProposals)
    .where(and(eq(assistantProposals.undoToken, hashUndoToken(undoToken)), eq(assistantProposals.staffId, user.member.id)))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function findByUndoToken(user: AuthenticatedUser, undoToken: string): Promise<Proposal | null> {
  const record = await findRecordByUndoToken(user, undoToken);
  return record?.proposal ?? null;
}

/** Daily cron: `propuesta` past `expires_at` becomes `expirada`; rows older than 90 days are deleted. */
export async function expireProposals(now: Date = new Date()): Promise<{ expired: number; deleted: number }> {
  const expired = await db
    .update(assistantProposals)
    .set({ status: "expirada" })
    .where(and(eq(assistantProposals.status, "propuesta"), lt(assistantProposals.expiresAt, now)))
    .returning({ id: assistantProposals.id });
  const deleted = await db
    .delete(assistantProposals)
    .where(lt(assistantProposals.createdAt, new Date(now.getTime() - PROPOSAL_RETENTION_DAYS * DAY_MS)))
    .returning({ id: assistantProposals.id });
  return { expired: expired.length, deleted: deleted.length };
}
