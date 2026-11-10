import "server-only";

import { IMPLEMENTED as MY_SPACE_IMPLEMENTED } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import type { SessionAccess } from "@/lib/auth/session";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { db } from "@/lib/db/client";
import { listReminders } from "@/lib/my-space/reminder-service";
import { addDays, localParts, ORG_TIME_ZONE, zonedTimeToUtc } from "@/lib/my-space/zoned-time";
import { countUnreadNotifications } from "@/lib/repositories/notifications-repository";
import { countOpenTasksFor } from "@/lib/repositories/tasks-repository";
import type { ShellBadges } from "@/lib/types/shell";

export type CapabilityUser = AuthenticatedUser;

/**
 * An active session's user as the capability resolvers read it (the shape
 * `requireCapabilityUser()` returns), without a second session read.
 */
export function capabilityUserOf(user: NonNullable<SessionAccess["user"]>): CapabilityUser {
  return {
    member: {
      id: user.id,
      name: user.name,
      role: user.role ?? "",
      area: user.area ?? "",
      capacity: 0,
      availability: "",
      active: user.active,
      institutionalEmail: user.email ?? "",
      phone: "",
    },
    email: user.email ?? "",
    access: user.access,
    ...(user.permissionOverrides ? { permissionOverrides: user.permissionOverrides } : {}),
  };
}

/**
 * `qk.shell.badges()` loader (plan §4.3 Shell, Phase 2): the sidebar
 * counters, three COUNT-sized reads in parallel and nothing else.
 *
 * - `tareasOpen`: the caller's open tasks (`countOpenTasksFor`, one COUNT(*)
 *   with `isTaskClosed` semantics); 0 when they can't view activities.
 * - `bandeja.unreadCount`: unread in-app notifications (one COUNT(*), no list).
 * - `bandeja.dueReminders`: `dueAt` of the open reminders still due today.
 *
 * Every read is keyed by the caller's own staff id, so the result never holds
 * anyone else's counts. A failing read counts 0: the badges are a hint and
 * the page works without them. No writes. The `(staff)` layout prefetches it
 * and `GET /api/shell/badges` serves the 60 s poll.
 */
export async function loadShellBadges(user: CapabilityUser, now: Date = new Date()): Promise<ShellBadges> {
  const [tareasOpen, unreadCount, dueReminders] = await Promise.all([
    loadOpenTasks(user),
    loadUnreadCount(user.member.id),
    loadDueReminders(user, now),
  ]);
  return { tareasOpen, bandeja: { unreadCount, dueReminders, renderedAt: now.getTime() } };
}

async function loadOpenTasks(user: CapabilityUser): Promise<number> {
  if (!resolveActivitiesCapabilities(user).canViewActivities) return 0;
  try {
    return Math.max(0, await countOpenTasksFor(user.member.id, viewerScopeOf(user)));
  } catch (err) {
    console.error("[shell-badges] open tasks", err);
    return 0;
  }
}

async function loadUnreadCount(staffId: string): Promise<number> {
  if (!NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction) return 0;
  try {
    return Math.max(0, await countUnreadNotifications(db, staffId));
  } catch (err) {
    console.error("[shell-badges] unread notifications", err);
    return 0;
  }
}

/** Last instant of the org's local day of `now`. */
export function endOfLocalDay(now: Date): Date {
  const { year, month, day } = localParts(now, ORG_TIME_ZONE);
  const tomorrow = zonedTimeToUtc(addDays({ year, month, day }, 1), 0, 0, ORG_TIME_ZONE);
  return new Date(tomorrow.getTime() - 1);
}

/**
 * `dueAt` of the caller's open reminders (not fired, not cancelled) still due
 * today, from `now` to the end of the local day; empty while the reminders
 * read is a stub or fails.
 */
export async function loadDueReminders(user: CapabilityUser, now: Date = new Date()): Promise<string[]> {
  if (!MY_SPACE_IMPLEMENTED.fetchRemindersAction) return [];
  try {
    const rows = await listReminders(user, { from: now.toISOString(), to: endOfLocalDay(now).toISOString() }, now);
    return rows.filter((row) => !row.firedAt && !row.cancelledAt).map((row) => row.dueAt);
  } catch (err) {
    console.error("[shell-badges] due reminders", err);
    return [];
  }
}
