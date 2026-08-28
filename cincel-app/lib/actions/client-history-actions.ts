"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { clientHistory, clients } from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import type { ClientHistoryEntry } from "@/lib/repositories/client-history-repository";

async function requireClientsCapabilities() {
  return resolveClientsCapabilities(await requireCapabilityUser());
}

export type ClientHistoryInput = {
  field: string;
  before: string;
  after: string;
  author: string;
};

/** All client history, keyed by client legacy id (matches the legacy shape). */
export async function fetchClientHistoryAction(): Promise<
  Record<number, ClientHistoryEntry[]>
> {
  const caps = await requireClientsCapabilities();
  if (!caps.canViewClients) return {};

  const rows = await db
    .select({
      id: clientHistory.id,
      legacyId: clients.legacyId,
      field: clientHistory.field,
      before: clientHistory.beforeValue,
      after: clientHistory.afterValue,
      author: clientHistory.authorName,
      eventAt: clientHistory.eventAt,
    })
    .from(clientHistory)
    .innerJoin(clients, eq(clients.id, clientHistory.clientId))
    .orderBy(desc(clientHistory.eventAt));

  const byClient: Record<number, ClientHistoryEntry[]> = {};
  for (const r of rows) {
    const key = r.legacyId ?? 0;
    (byClient[key] ??= []).push({
      id: r.id,
      clientId: key,
      field: r.field,
      before: r.before,
      after: r.after,
      author: r.author,
      date: r.eventAt.toISOString(),
    });
  }
  return byClient;
}

export async function appendClientHistoryAction(
  clientLegacyId: number,
  entries: ClientHistoryInput[]
): Promise<void> {
  const caps = await requireClientsCapabilities();
  if (!caps.canEditClient) {
    throw new Error("FORBIDDEN: client history write");
  }
  if (entries.length === 0) return;

  const [clientRow] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.legacyId, clientLegacyId))
    .limit(1);
  if (!clientRow) {
    throw new Error(`client history: no client with legacy id ${clientLegacyId}`);
  }

  await db.insert(clientHistory).values(
    entries.map((e) => ({
      clientId: clientRow.id,
      field: e.field,
      beforeValue: e.before,
      afterValue: e.after,
      authorName: e.author,
    }))
  );

  revalidatePath("/clientes");
}
