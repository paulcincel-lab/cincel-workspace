import { createHash } from "node:crypto";

import type { CalendarEvent } from "@/lib/types/calendar";

/**
 * Pure planning for the Google Calendar sync (#434): what the app wants in
 * the user's "Cincel" calendar vs. what was pushed last time. Kept free of
 * I/O so it can be unit-tested; calendar-api.ts does the HTTP.
 *
 * Events are all-day for the same reason as the ICS feed (lib/calendar/ics.ts):
 * tasks only store dates, and an invented time would put false blocks in
 * someone's real agenda.
 */

export type GoogleEventBody = {
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  transparency: "transparent";
  source: { title: string; url: string };
};

export type SyncedEvent = { eventKey: string; googleEventId: string; contentHash: string };

export type DesiredEvent = { eventKey: string; body: GoogleEventBody; contentHash: string };

export type SyncPlan = {
  create: DesiredEvent[];
  update: Array<DesiredEvent & { googleEventId: string }>;
  delete: SyncedEvent[];
};

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function toGoogleEvent(event: CalendarEvent, baseUrl: string): GoogleEventBody {
  const url = new URL(event.href, baseUrl).toString();
  const description = [
    `Proyecto: ${event.project}`,
    `Etapa: ${event.stageLabel}`,
    `Responsable: ${event.responsible}`,
    event.phase ? `Fase: ${event.phase}` : null,
    `Tipo: ${event.type}`,
    "",
    url,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    summary: event.title,
    description,
    start: { date: event.date },
    end: { date: nextDay(event.date) },
    transparency: "transparent",
    source: { title: "Cincel Workspace", url },
  };
}

export function hashGoogleEvent(body: GoogleEventBody): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export function toDesiredEvents(events: CalendarEvent[], baseUrl: string): DesiredEvent[] {
  const byKey = new Map<string, DesiredEvent>();
  for (const event of events) {
    const body = toGoogleEvent(event, baseUrl);
    byKey.set(event.id, { eventKey: event.id, body, contentHash: hashGoogleEvent(body) });
  }
  return [...byKey.values()];
}

/** Only what changed: new events are created, edited ones patched, vanished ones deleted. */
export function planSync(desired: DesiredEvent[], existing: SyncedEvent[]): SyncPlan {
  const existingByKey = new Map(existing.map((e) => [e.eventKey, e]));
  const desiredKeys = new Set(desired.map((e) => e.eventKey));

  const plan: SyncPlan = { create: [], update: [], delete: [] };
  for (const event of desired) {
    const current = existingByKey.get(event.eventKey);
    if (!current) plan.create.push(event);
    else if (current.contentHash !== event.contentHash) plan.update.push({ ...event, googleEventId: current.googleEventId });
  }
  for (const event of existing) {
    if (!desiredKeys.has(event.eventKey)) plan.delete.push(event);
  }
  return plan;
}
