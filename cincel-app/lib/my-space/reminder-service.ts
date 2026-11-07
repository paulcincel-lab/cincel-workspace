/**
 * Mi espacio reminders (redesign BE §7.5, §9.1, §9.4). Owner-only: every read
 * and write goes through the `ownerScoped` reminders repository with the
 * session's staff id, so another person's reminder is `FORBIDDEN` and a
 * missing one `NOT_FOUND`; there is no admin bypass. `dueAt` is stored in UTC.
 * The actions in `lib/actions/my-space-actions.ts` call these with the
 * session user and revalidate `/mi-espacio`.
 */
import "server-only";

import { and, asc, gte, isNull, lte } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData, resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { reminders } from "@/lib/db/schema";
import { parseReminderText } from "@/lib/my-space/reminder-parser";
import { reminderLinksVisible, toReminder } from "@/lib/my-space/reminders";
import { remindersRepository } from "@/lib/repositories/my-space-repository";
import type { ParsedReminder, Reminder } from "@/lib/types/redesign";
import { UuidSchema } from "@/lib/validation/project-flow";
import {
  IsoDateTimeSchema,
  ReminderInputSchema,
  ReminderTextSchema,
  RemindersRangeSchema,
  parseInput,
} from "@/lib/validation/redesign";

/** A `dueAt` this far in the past is still accepted (BE §7.5: `PAST_TIME` when dueAt < now − 60 s). */
export const PAST_TIME_GRACE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Most reminders one range read returns. */
const RANGE_LIMIT = 500;

/** A malformed id can't name a row: `NOT_FOUND` (never a database error). */
function rowId(id: unknown): string {
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) throw new Error("NOT_FOUND");
  return parsed.data;
}

function assertNotPast(at: Date, now: Date): void {
  if (at.getTime() < now.getTime() - PAST_TIME_GRACE_MS) throw new Error("PAST_TIME");
}

/** Open reminders (not fired, not cancelled) by `dueAt`, default now − 1 day … now + 30 days. */
export async function listReminders(user: AuthenticatedUser, input: unknown, now = new Date()): Promise<Reminder[]> {
  const range = parseInput(RemindersRangeSchema, input ?? {});
  const from = range.from ? new Date(range.from) : new Date(now.getTime() - DAY_MS);
  const to = range.to ? new Date(range.to) : new Date(now.getTime() + 30 * DAY_MS);
  if (from.getTime() > to.getTime()) throw new Error("INVALID: from");
  const rows = await remindersRepository.list(db, user.member.id, {
    where: and(
      gte(reminders.dueAt, from),
      lte(reminders.dueAt, to),
      isNull(reminders.firedAt),
      isNull(reminders.cancelledAt),
    ),
    orderBy: [asc(reminders.dueAt)],
    limit: RANGE_LIMIT,
  });
  return rows.map(toReminder);
}

/** Natural-language parse (BE §8.4) in the org time zone. */
export function parseText(text: unknown, now = new Date()): ParsedReminder {
  return parseReminderText(parseInput(ReminderTextSchema, text), now);
}

export async function createReminder(user: AuthenticatedUser, input: unknown, now = new Date()): Promise<Reminder> {
  const values = parseInput(ReminderInputSchema, input);
  const dueAt = new Date(values.dueAt);
  assertNotPast(dueAt, now);

  const visible = await reminderLinksVisible(
    db,
    {
      isAdmin: canSeeAdminData(user),
      canViewTasks: resolveActivitiesCapabilities(user).canViewActivities,
      canViewProjects: resolveProjectsCapabilities(user).canViewProjects,
    },
    { taskId: values.taskId, projectId: values.projectId },
  );
  if (!visible) throw new Error(values.taskId ? "INVALID: taskId" : "INVALID: projectId");

  const row = await remindersRepository.insert(db, user.member.id, {
    text: values.text,
    dueAt,
    repeat: values.repeat ?? "none",
    channels: values.channels ? [...new Set(values.channels)] : ["app"],
    taskId: values.taskId ?? null,
    projectId: values.projectId ?? null,
  });
  return toReminder(row);
}

/** `dueAt = until`, `firedAt = null` (also re-opens a fired one-off reminder, BE §9.4). Cancelled → `NOT_FOUND`. */
export async function snoozeReminder(
  user: AuthenticatedUser,
  id: unknown,
  until: unknown,
  now = new Date(),
): Promise<Reminder> {
  const reminderId = rowId(id);
  const dueAt = new Date(parseInput(IsoDateTimeSchema, until));
  const current = await remindersRepository.get(db, user.member.id, reminderId);
  if (current.cancelledAt) throw new Error("NOT_FOUND");
  assertNotPast(dueAt, now);
  const row = await remindersRepository.update(db, user.member.id, reminderId, {
    dueAt,
    firedAt: null,
    updatedAt: now,
  });
  return toReminder(row);
}

/** Sets `cancelledAt`; cancelling twice keeps the first time. */
export async function cancelReminder(user: AuthenticatedUser, id: unknown, now = new Date()): Promise<void> {
  const reminderId = rowId(id);
  const current = await remindersRepository.get(db, user.member.id, reminderId);
  if (current.cancelledAt) return;
  await remindersRepository.update(db, user.member.id, reminderId, { cancelledAt: now, updatedAt: now });
}
