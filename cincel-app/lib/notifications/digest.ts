/**
 * Notification email delivery (redesign BE §8.3, §9.3, §13).
 *
 * - `deliverPendingEmails` (job `notifications-deliver`, every tick): sends the
 *   `email_status = 'pending'` rows whose `deliver_after ≤ now` (limit 200)
 *   and records `sent` / `failed` (+ `email_error`) on each row.
 * - `sendDailyDigests` (job `daily-digest`, after the daily producers): one
 *   `resumen-diario` email per staff with at least one undigested `digest`
 *   row of the last 24 h; sets `digested_at` on the rows it covered.
 *
 * Neither throws for a single bad row or recipient: the failure is recorded
 * and the loop carries on.
 */
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { notifications, staff } from "@/lib/db/schema";
import { sendMail, type MailMessage, type SendMailResult } from "@/lib/email";
import {
  recordatorioEmail,
  resumenDiarioEmail,
  type MailContent,
  type ResumenDiarioItem,
  type ResumenDiarioParams,
} from "@/lib/email/templates";
import { button, htmlDocument, paragraph, trimOrigin } from "@/lib/email/templates/layout";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { NotificationKind } from "@/lib/types/redesign";

/** Most pending emails sent by one `notifications-deliver` run. */
export const DELIVER_BATCH_LIMIT = 200;

/** Digest rows older than this are not included in the daily digest. */
export const DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Where a notification without its own `url` links to (the Bandeja). */
export const NOTIFICATIONS_FALLBACK_PATH = "/mi-espacio";

/** Label of the link button in notification emails. */
export const OPEN_IN_CINCEL = "Abrir en Cincel";

/** `email_error` values written by the delivery job. */
export type EmailFailure = "no_email" | "inactive" | "not_configured" | "failed" | "render_failed";

export type MailSender = (message: MailMessage) => Promise<SendMailResult>;

export type DeliveryOptions = {
  /** Mail transport; defaults to `sendMail` (log-only without `SMTP_HOST`). */
  send?: MailSender;
  /** Public origin for absolute links; defaults to `APP_ORIGIN`. */
  origin?: string | null;
  /** Batch size; defaults to {@link DELIVER_BATCH_LIMIT}. */
  limit?: number;
};

type NotificationMailRow = {
  kind: NotificationKind;
  title: string;
  body: string;
  url: string | null;
  dedupeKey: string | null;
  createdAt: Date;
};

const defaultSend: MailSender = (message) => sendMail(message);

/** `url` as an absolute link: relative paths are joined to `origin` (when known). */
export function absoluteUrl(url: string | null | undefined, origin: string | null | undefined): string {
  const target = url && url.trim() ? url.trim() : NOTIFICATIONS_FALLBACK_PATH;
  if (/^https?:\/\//i.test(target)) return target;
  if (!origin) return target;
  return `${trimOrigin(origin)}${target.startsWith("/") ? "" : "/"}${target}`;
}

/** The `dueAt` encoded in a reminder dedupe key `recordatorio:<reminderId>:<dueAt ISO>`, if any. */
export function reminderDueAtFromDedupeKey(dedupeKey: string | null | undefined): string | null {
  if (!dedupeKey?.startsWith("recordatorio:")) return null;
  const rest = dedupeKey.slice("recordatorio:".length);
  const sep = rest.indexOf(":");
  if (sep < 0) return null;
  const iso = rest.slice(sep + 1);
  return iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
}

/** The plain notification email: title as subject, body, and a button to the notification's link. */
export function notificationEmail(row: Pick<NotificationMailRow, "title" | "body">, link: string): MailContent {
  const body = row.body.trim();
  const lines = [row.title];
  if (body) lines.push("", body);
  lines.push("", `${OPEN_IN_CINCEL}: ${link}`);
  const blocks = [paragraph(row.title)];
  if (body) blocks.push(paragraph(body));
  blocks.push(button(OPEN_IN_CINCEL, link));
  return { subject: row.title, text: lines.join("\n"), html: htmlDocument(blocks) };
}

/** The email of one notification row: `recordatorio` uses its template, every other kind the plain one. */
export function renderNotificationEmail(row: NotificationMailRow, origin: string | null): MailContent {
  const link = absoluteUrl(row.url, origin);
  if (row.kind === "recordatorio") {
    const dueAt = reminderDueAtFromDedupeKey(row.dedupeKey) ?? row.createdAt.toISOString();
    return recordatorioEmail({ text: row.title, dueAt, url: link });
  }
  return notificationEmail(row, link);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Sends due `pending` emails (limit 200) and records `sent` / `failed` (job `notifications-deliver`). */
export async function deliverPendingEmails(
  db: OwnerDb,
  now: Date,
  options: DeliveryOptions = {}
): Promise<{ count: number }> {
  const send = options.send ?? defaultSend;
  const origin = options.origin === undefined ? getAppOrigin() : options.origin;
  const limit = options.limit ?? DELIVER_BATCH_LIMIT;

  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      dedupeKey: notifications.dedupeKey,
      createdAt: notifications.createdAt,
      email: staff.email,
      active: staff.active,
    })
    .from(notifications)
    .innerJoin(staff, eq(staff.id, notifications.staffId))
    .where(and(eq(notifications.emailStatus, "pending"), lte(notifications.deliverAfter, now)))
    .orderBy(asc(notifications.deliverAfter), asc(notifications.id))
    .limit(limit);

  let count = 0;
  for (const row of rows) {
    let failure: EmailFailure | null = null;
    let detail: string | null = null;
    const to = row.email?.trim();

    if (!row.active) failure = "inactive";
    else if (!to) failure = "no_email";
    else {
      let content: MailContent | null = null;
      try {
        content = renderNotificationEmail(row, origin);
      } catch (err) {
        failure = "render_failed";
        detail = errorText(err);
      }
      if (content) {
        try {
          const result = await send({ to, ...content });
          if (!result.sent) failure = result.reason;
        } catch (err) {
          failure = "failed";
          detail = errorText(err);
        }
      }
    }

    await db
      .update(notifications)
      .set(
        failure
          ? { emailStatus: "failed", emailError: detail ? `${failure}: ${detail}` : failure }
          : { emailStatus: "sent", emailedAt: now, emailError: null }
      )
      .where(and(eq(notifications.id, row.id), eq(notifications.emailStatus, "pending")));
    count += 1;
  }
  return { count };
}

/** Digest section of each kind; kinds without a section are marked digested but not listed. */
const DIGEST_SECTION: Partial<Record<NotificationKind, keyof ResumenDiarioParams>> = {
  asignacion: "asignaciones",
  mencion: "menciones",
  vencimiento: "vencimientos",
  comentario: "comentarios",
};

export type DigestRow = { id: string; kind: NotificationKind; title: string; url: string | null };

/** Groups one recipient's digest rows into the `resumen-diario` sections, keeping their order. */
export function buildDigestParams(rows: DigestRow[], origin: string | null): ResumenDiarioParams {
  const params: ResumenDiarioParams = { asignaciones: [], menciones: [], vencimientos: [], comentarios: [] };
  for (const row of rows) {
    const section = DIGEST_SECTION[row.kind];
    if (!section) continue;
    const item: ResumenDiarioItem = { title: row.title, url: absoluteUrl(row.url, origin) };
    params[section].push(item);
  }
  return params;
}

function hasItems(params: ResumenDiarioParams): boolean {
  return Object.values(params).some((items) => items.length > 0);
}

/**
 * One `resumen-diario` email per active staff with an email and ≥ 1 row
 * `digest = true and digested_at is null` from the last 24 h. The rows get
 * `digested_at = now` once their email was sent (or right away when none of
 * them belongs to a digest section). A failed send leaves them untouched.
 * Returns the number of digests sent.
 */
export async function sendDailyDigests(
  db: OwnerDb,
  now: Date,
  options: Omit<DeliveryOptions, "limit"> = {}
): Promise<{ count: number }> {
  const send = options.send ?? defaultSend;
  const origin = options.origin === undefined ? getAppOrigin() : options.origin;
  const since = new Date(now.getTime() - DIGEST_LOOKBACK_MS);

  const rows = await db
    .select({
      id: notifications.id,
      staffId: notifications.staffId,
      kind: notifications.kind,
      title: notifications.title,
      url: notifications.url,
      email: staff.email,
    })
    .from(notifications)
    .innerJoin(staff, eq(staff.id, notifications.staffId))
    .where(
      and(
        eq(notifications.digest, true),
        isNull(notifications.digestedAt),
        gte(notifications.createdAt, since),
        lte(notifications.createdAt, now),
        eq(staff.active, true)
      )
    )
    .orderBy(asc(notifications.staffId), asc(notifications.createdAt), asc(notifications.id));

  const byStaff = new Map<string, { email: string | null; rows: DigestRow[] }>();
  for (const row of rows) {
    const entry = byStaff.get(row.staffId) ?? { email: row.email, rows: [] };
    entry.rows.push(row);
    byStaff.set(row.staffId, entry);
  }

  let count = 0;
  for (const [staffId, entry] of byStaff) {
    const to = entry.email?.trim();
    if (!to) continue;
    const params = buildDigestParams(entry.rows, origin);

    if (hasItems(params)) {
      try {
        const result = await send({ to, ...resumenDiarioEmail(params) });
        if (!result.sent) continue;
      } catch (err) {
        console.error(JSON.stringify({ level: "error", msg: "digest.failed", staff_id: staffId, error: errorText(err) }));
        continue;
      }
      count += 1;
    }

    await db
      .update(notifications)
      .set({ digestedAt: now })
      .where(
        and(
          inArray(
            notifications.id,
            entry.rows.map((r) => r.id)
          ),
          isNull(notifications.digestedAt)
        )
      );
  }
  return { count };
}
