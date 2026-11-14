/**
 * Writes and reads of publishing a solicitud to GitHub (#1116). Server-only.
 * Re-exported by `support-repository.ts` as `recordPublished`.
 */
import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contactPeople, contacts, projects, staff, supportTicketEvents, supportTickets } from "@/lib/db/schema";
import type { RedactionContext } from "@/lib/soporte/redact";
import type { ActionResult } from "@/lib/types/schedule";
import type { PublishTicketInput, TicketArea, TicketContext, TicketKind, TicketStatus } from "@/lib/types/soporte";

export type PublishableTicket = {
  id: string;
  code: string;
  kind: TicketKind;
  title: string;
  description: string;
  steps: string | null;
  area: TicketArea;
  context: TicketContext;
  status: TicketStatus;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
};

/** The fields the preview needs; null when the solicitud does not exist. */
export async function getPublishableTicket(id: string): Promise<PublishableTicket | null> {
  const [row] = await db
    .select({
      id: supportTickets.id,
      code: supportTickets.code,
      kind: supportTickets.kind,
      title: supportTickets.title,
      description: supportTickets.description,
      steps: supportTickets.steps,
      area: supportTickets.area,
      context: supportTickets.context,
      status: supportTickets.status,
      githubIssueNumber: supportTickets.githubIssueNumber,
      githubIssueUrl: supportTickets.githubIssueUrl,
    })
    .from(supportTickets)
    .where(eq(supportTickets.id, id))
    .limit(1);
  return row ? { ...row, area: row.area as TicketArea } : null;
}

function fullName(name: string, lastName: string | null): string[] {
  const trimmed = name.trim();
  const last = lastName?.trim();
  return last ? [`${trimmed} ${last}`, trimmed] : [trimmed];
}

/** Every name the app knows that must not reach the public repository. */
export async function loadRedactionContext(): Promise<RedactionContext> {
  const [staffRows, contactRows, personRows, projectRows] = await Promise.all([
    db.select({ name: staff.name, lastName: staff.lastName }).from(staff),
    db.select({ name: contacts.name }).from(contacts),
    db.select({ name: contactPeople.name }).from(contactPeople),
    db.select({ name: projects.name }).from(projects),
  ]);
  const origin = (process.env.APP_ORIGIN ?? "").trim();
  let host: string | null = null;
  try {
    host = origin ? new URL(origin).host : null;
  } catch {
    host = null;
  }
  return {
    staffNames: staffRows.flatMap((r) => fullName(r.name, r.lastName)),
    contactNames: personRows.map((r) => r.name),
    clientNames: contactRows.map((r) => r.name),
    projectNames: projectRows.map((r) => r.name),
    appHosts: host ? [host] : [],
  };
}

/**
 * Stores the issue number and URL, writes the `published` event and moves
 * `nuevo`/`en_revision` to `planeado`. The update only matches a solicitud
 * without an issue, so publishing twice never overwrites the first one.
 */
export async function recordPublished(
  actorId: string,
  id: string,
  issue: { number: number; url: string },
  _input: PublishTicketInput,
): Promise<ActionResult<null>> {
  return db.transaction(async (tx): Promise<ActionResult<null>> => {
    const [current] = await tx
      .select({ status: supportTickets.status, githubIssueNumber: supportTickets.githubIssueNumber })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .for("update");
    if (!current) return { ok: false, error: "NOT_FOUND" };
    if (current.githubIssueNumber !== null) return { ok: false, error: "ALREADY_PUBLISHED" };

    const planned = current.status === "nuevo" || current.status === "en_revision";
    const [updated] = await tx
      .update(supportTickets)
      .set({
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.url,
        ...(planned ? { status: "planeado" as const } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(supportTickets.id, id), isNull(supportTickets.githubIssueNumber)))
      .returning({ id: supportTickets.id });
    if (!updated) return { ok: false, error: "ALREADY_PUBLISHED" };

    await tx.insert(supportTicketEvents).values({
      ticketId: id,
      actorId,
      type: "published",
      visibility: "public",
      payload: { github: { number: issue.number, url: issue.url } },
    });
    if (planned) {
      await tx.insert(supportTicketEvents).values({
        ticketId: id,
        actorId,
        type: "status",
        visibility: "public",
        payload: { from: current.status, to: "planeado" },
      });
    }
    return { ok: true, data: null };
  });
}
