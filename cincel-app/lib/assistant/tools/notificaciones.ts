/**
 * Assistant tool group "Notificaciones y recordatorios (7)" (redesign BE §10.3;
 * Phase 7): list_notifications, mark_notifications_read, create_reminder,
 * list_reminders, cancel_reminder, notify_people, schedule_digest.
 *
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * (from the client-safe `lib/assistant/tool-summaries.ts`) and `available(ctx)`
 * reading only the flags modules of the actions it calls (Rule 3).
 *
 * Audit (BE §9.9): reminders, notifications and notification preferences are
 * owner-only, so nothing here writes `history_events`; the approval audit is
 * the `assistant_actions` row kept by the chat route.
 */
import "server-only";

import { z } from "zod";

import { IMPLEMENTED as MY_SPACE } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS } from "@/lib/actions/notifications-actions.flags";
import {
  cancelReminderAction,
  createReminderAction,
  fetchRemindersAction,
  parseReminderTextAction,
  snoozeReminderAction,
} from "@/lib/actions/my-space-actions";
import {
  fetchNotificationPreferencesAction,
  fetchNotificationsAction,
  markNotificationsReadAction,
  updateNotificationPreferencesAction,
} from "@/lib/actions/notifications-actions";
import { defineTool, type DefinedTool } from "@/lib/assistant/define-tool";
import { resolveProject, resolveStaff } from "@/lib/assistant/resolvers";
import { toolSummaries } from "@/lib/assistant/tool-summaries";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { db } from "@/lib/db/client";
import { actionErrorText } from "@/lib/errors";
import { notify } from "@/lib/notifications/notify";
import type { NotificationItem, Reminder } from "@/lib/types/redesign";
import {
  HourMinuteSchema,
  IsoDateTimeSchema,
  NotificationKindSchema,
  ReminderChannelSchema,
  ReminderRepeatSchema,
  ReminderTextSchema,
} from "@/lib/validation/redesign";

/** The org-wide hour of the `daily-digest` job (BE §9.3, §13; review R3-1). */
export const DIGEST_TIME = "07:30";

const LEAD_ROLES: readonly string[] = ["Jefe de Taller", "Jefe de Construcción"];

/** **lead** (BE §10.1): access Administrador or Dirección, or role Jefe de Taller / Jefe de Construcción. */
export function isLead(user: AuthenticatedUser): boolean {
  if (user.access === "Administrador" || user.access === "Dirección") return true;
  return LEAD_ROLES.includes(user.access) || LEAD_ROLES.includes(user.member.role);
}

const everyone = () => true;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(err: unknown) {
  return { ok: false as const, error: actionErrorText(err) };
}

function notificationRow(item: NotificationItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    url: item.url,
    read: item.readAt !== null,
    createdAt: item.createdAt,
  };
}

function reminderRow(reminder: Reminder) {
  return {
    id: reminder.id,
    text: reminder.text,
    dueAt: reminder.dueAt,
    repeat: reminder.repeat,
    channels: reminder.channels,
    taskId: reminder.taskId,
    projectId: reminder.projectId,
    fired: reminder.firedAt !== null,
  };
}

/** A link a notification may carry: an app path (`/…`, not `//…`) or an http(s) URL. */
export function isAllowedNotificationLink(link: string): boolean {
  const value = link.trim();
  if (value.startsWith("/")) return !value.startsWith("//") && !value.startsWith("/\\");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** ISO date-time with an explicit zone (what `createReminderAction` takes as `dueAt`), else null. */
function isoDueAt(when: string): string | null {
  return IsoDateTimeSchema.safeParse(when).success ? new Date(when).toISOString() : null;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

export const listNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional().describe("Solo las no leídas"),
  types: z.array(NotificationKindSchema).max(7).optional().describe("Filtra por tipo de notificación"),
});

export const markNotificationsReadSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(200).optional().describe("Ids de las notificaciones (de list_notifications)"),
    all: z.boolean().optional().describe("Marca todas como leídas"),
  })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, {
    message: "Indica ids o all: true",
    path: ["ids"],
  });

export const createReminderSchema = z.object({
  text: ReminderTextSchema.describe("Qué recordar"),
  when: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe('Cuándo: lenguaje natural ("mañana a las 9", "el viernes") o fecha ISO con zona'),
  repeat: ReminderRepeatSchema.optional(),
  link: z
    .object({
      taskId: z.uuid().optional(),
      projectId: z.string().trim().min(1).max(200).optional().describe("Id o nombre del proyecto"),
    })
    .optional(),
  channels: z.array(ReminderChannelSchema).min(1).max(2).optional(),
});

export const listRemindersSchema = z.object({
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
});

export const cancelReminderSchema = z.object({
  reminderId: z.uuid(),
  snoozeUntil: IsoDateTimeSchema.optional().describe("Si se indica, pospone en lugar de cancelar"),
});

export const notifyPeopleSchema = z.object({
  people: z.array(z.string().trim().min(1).max(200)).min(1).max(20).describe("Nombres de las personas"),
  text: z.string().trim().min(1).max(500),
  link: z.string().trim().min(1).max(500).optional().describe("Ruta de la app (/proyectos/…) o URL"),
  urgency: z.enum(["normal", "alta"]).optional(),
});

export const scheduleDigestSchema = z.object({
  time: HourMinuteSchema.describe('Hora "HH:MM"'),
  scope: z.literal("diario"),
});

// ── Tools ───────────────────────────────────────────────────────────────────

const list_notifications = defineTool({
  name: "list_notifications",
  description:
    "Lista las notificaciones de la bandeja del usuario (más recientes primero) con el total sin leer. Filtra por no leídas o por tipo.",
  schema: listNotificationsSchema,
  capability: everyone,
  available: () => NOTIFICATIONS.fetchNotificationsAction,
  confirm: false,
  write: false,
  summarize: toolSummaries.list_notifications,
  async run(_ctx, input) {
    try {
      const page = await fetchNotificationsAction({ unreadOnly: input.unreadOnly, kinds: input.types });
      return {
        ok: true,
        unreadCount: page.unreadCount,
        items: page.items.map(notificationRow),
        hasMore: page.nextCursor !== null,
      };
    } catch (err) {
      return failure(err);
    }
  },
});

const mark_notifications_read = defineTool({
  name: "mark_notifications_read",
  description: "Marca como leídas notificaciones del usuario: por ids (de list_notifications) o todas.",
  schema: markNotificationsReadSchema,
  capability: everyone,
  available: () => NOTIFICATIONS.markNotificationsReadAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.mark_notifications_read,
  async run(_ctx, input) {
    try {
      const { unreadCount } = await markNotificationsReadAction(input.all ? "all" : (input.ids ?? []));
      return { ok: true, unreadCount };
    } catch (err) {
      return failure(err);
    }
  },
});

const create_reminder = defineTool({
  name: "create_reminder",
  description:
    "Crea un recordatorio personal. `when` acepta lenguaje natural o una fecha ISO; puede repetirse y ligarse a una tarea o proyecto.",
  schema: createReminderSchema,
  capability: everyone,
  available: () => MY_SPACE.parseReminderTextAction && MY_SPACE.createReminderAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.create_reminder,
  async run(_ctx, input) {
    try {
      let text = input.text;
      let dueAt = input.when ? isoDueAt(input.when) : null;
      let repeat = input.repeat;
      if (!dueAt) {
        const phrase = input.when ? `${input.text} ${input.when}` : input.text;
        const parsed = await parseReminderTextAction(phrase.slice(0, 280));
        dueAt = parsed.dueAt;
        if (parsed.cleanText.trim()) text = parsed.cleanText.trim();
        if (!repeat && parsed.repeat !== "none") repeat = parsed.repeat;
      }
      if (!dueAt) {
        return {
          ok: false,
          error: "No entendí cuándo debe sonar el recordatorio. Indica una fecha y hora, por ejemplo «mañana a las 9».",
        };
      }

      let projectId: string | undefined;
      const projectRef = input.link?.projectId;
      if (projectRef) {
        if (UUID_RE.test(projectRef)) {
          projectId = projectRef;
        } else {
          const resolved = await resolveProject(projectRef);
          if (!resolved.ok) return resolved;
          projectId = resolved.value.id;
        }
      }

      const reminder = await createReminderAction({
        text,
        dueAt,
        repeat,
        channels: input.channels,
        taskId: input.link?.taskId,
        projectId,
      });
      return { ok: true, reminder: reminderRow(reminder) };
    } catch (err) {
      return failure(err);
    }
  },
});

const list_reminders = defineTool({
  name: "list_reminders",
  description:
    "Lista los recordatorios abiertos del usuario por fecha (por defecto desde ayer hasta dentro de 30 días). Fechas ISO con zona.",
  schema: listRemindersSchema,
  capability: everyone,
  available: () => MY_SPACE.fetchRemindersAction,
  confirm: false,
  write: false,
  summarize: toolSummaries.list_reminders,
  async run(_ctx, input) {
    try {
      const reminders = await fetchRemindersAction({ from: input.from, to: input.to });
      return { ok: true, reminders: reminders.map(reminderRow) };
    } catch (err) {
      return failure(err);
    }
  },
});

const cancel_reminder = defineTool({
  name: "cancel_reminder",
  description:
    "Cancela un recordatorio del usuario por id (de list_reminders) o, con snoozeUntil, lo pospone hasta esa fecha y hora.",
  schema: cancelReminderSchema,
  capability: everyone,
  available: () => MY_SPACE.cancelReminderAction && MY_SPACE.snoozeReminderAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.cancel_reminder,
  async run(_ctx, input) {
    try {
      if (input.snoozeUntil) {
        const reminder = await snoozeReminderAction(input.reminderId, new Date(input.snoozeUntil).toISOString());
        return { ok: true, snoozed: true, reminder: reminderRow(reminder) };
      }
      await cancelReminderAction(input.reminderId);
      return { ok: true, cancelled: true, reminderId: input.reminderId };
    } catch (err) {
      return failure(err);
    }
  },
});

const notify_people = defineTool({
  name: "notify_people",
  description:
    "Envía una notificación de sistema a una o varias personas del equipo (por nombre), con un enlace opcional. Requiere confirmación.",
  schema: notifyPeopleSchema,
  capability: isLead,
  // `notify` is the shared producer (BE §8.3), not a server action: no flags module gates it.
  available: () => true,
  confirm: true,
  write: true,
  summarize: toolSummaries.notify_people,
  async run(ctx, input) {
    try {
      if (input.link && !isAllowedNotificationLink(input.link)) {
        return { ok: false, error: "El enlace debe ser una ruta de Cincel (/…) o una dirección http(s)." };
      }

      const ids: string[] = [];
      const names: string[] = [];
      for (const person of input.people) {
        const resolved = await resolveStaff(person);
        if (!resolved.ok) return resolved;
        if (!ids.includes(resolved.value.id)) {
          ids.push(resolved.value.id);
          names.push(resolved.value.name);
        }
      }

      const sender = ctx.user.member.name;
      const { created } = await notify(db, ids, {
        kind: "sistema",
        title: input.urgency === "alta" ? `Urgente · ${sender}` : `Mensaje de ${sender}`,
        body: input.text,
        url: input.link,
        actorId: ctx.user.member.id,
      });
      return { ok: true, notified: created, recipients: names };
    } catch (err) {
      return failure(err);
    }
  },
});

const schedule_digest = defineTool({
  name: "schedule_digest",
  description: `Activa el resumen diario por correo con las notificaciones del usuario. Sale a las ${DIGEST_TIME} para toda la organización; no se puede elegir otra hora.`,
  schema: scheduleDigestSchema,
  capability: everyone,
  available: () =>
    NOTIFICATIONS.fetchNotificationPreferencesAction && NOTIFICATIONS.updateNotificationPreferencesAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.schedule_digest,
  async run(_ctx, input) {
    if (input.time !== DIGEST_TIME) {
      return {
        ok: false,
        time: DIGEST_TIME,
        message: `El resumen diario se envía a las ${DIGEST_TIME} para toda la organización y no se puede cambiar la hora. Si quieres, lo activo a las ${DIGEST_TIME}.`,
      };
    }
    try {
      const current = await fetchNotificationPreferencesAction();
      const saved = await updateNotificationPreferencesAction({
        ...current,
        rows: current.rows.map((row) => ({ ...row, digest: true })),
      });
      return {
        ok: true,
        time: DIGEST_TIME,
        scope: input.scope,
        kinds: saved.rows.filter((row) => row.digest).map((row) => row.kind),
      };
    } catch (err) {
      return failure(err);
    }
  },
});

export const tools: DefinedTool[] = [
  list_notifications,
  mark_notifications_read,
  create_reminder,
  list_reminders,
  cancel_reminder,
  notify_people,
  schedule_digest,
];
