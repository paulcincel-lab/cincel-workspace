"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { clientContacts, clients, projects } from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import type { ManualClient } from "@/lib/repositories/clients-repository";

async function requireClientsCapabilities() {
  return resolveClientsCapabilities(await requireCapabilityUser());
}

function toManualClient(row: {
  legacyId: number | null;
  name: string;
  kind: string;
  phone: string | null;
  acquisitionChannel: string | null;
  totalSpentMxn: string;
  totalProjectsWorked: number;
  firstWorkDate: string | null;
  hasActiveProject: boolean;
  activeProjectName: string | null;
  activeProjectType: string | null;
  contacts: Array<{
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
  }>;
}): ManualClient {
  const contacts = row.contacts.map((c) => ({
    name: c.name,
    role: c.role ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
  }));
  return {
    id: row.legacyId ?? 0,
    name: row.name,
    emails: contacts.map((c) => c.email).filter(Boolean),
    phone: row.phone ?? "",
    kind: row.kind === "Empresa" ? "Empresa" : "Particular",
    contacts,
    completedProjects: [],
    acquisitionChannel: row.acquisitionChannel ?? "",
    totalSpent: Number(row.totalSpentMxn ?? 0),
    hasActiveProject: row.hasActiveProject,
    projectName: row.activeProjectName ?? "",
    projectType: row.activeProjectType ?? "",
    totalProjectsWorked: row.totalProjectsWorked,
    firstWorkDate: row.firstWorkDate ?? "",
  };
}

export async function fetchClientsAction(): Promise<ManualClient[]> {
  const caps = await requireClientsCapabilities();
  if (!caps.canViewClients) return [];

  const rows = await db.query.clients.findMany({
    where: isNull(clients.deletedAt),
    orderBy: asc(clients.name),
    with: {
      contacts: {
        where: isNull(clientContacts.deletedAt),
        orderBy: asc(clientContacts.sortOrder),
      },
    },
  });

  return rows.map((r) =>
    toManualClient({
      legacyId: r.legacyId,
      name: r.name,
      kind: r.kind,
      phone: r.phone,
      acquisitionChannel: r.acquisitionChannel,
      totalSpentMxn: r.totalSpentMxn,
      totalProjectsWorked: r.totalProjectsWorked,
      firstWorkDate: r.firstWorkDate,
      hasActiveProject: r.hasActiveProject,
      activeProjectName: r.activeProjectName,
      activeProjectType: r.activeProjectType,
      contacts: r.contacts,
    })
  );
}

export async function saveClientsAction(list: ManualClient[]): Promise<void> {
  const caps = await requireClientsCapabilities();
  if (!caps.canCreateClient && !caps.canEditClient) {
    throw new Error("FORBIDDEN: clients write");
  }

  for (const c of list) {
    const [row] = await db
      .insert(clients)
      .values({
        legacyId: c.id,
        name: c.name,
        kind: c.kind,
        phone: c.phone || null,
        acquisitionChannel: c.acquisitionChannel || null,
        totalSpentMxn: String(c.totalSpent ?? 0),
        totalProjectsWorked: c.totalProjectsWorked ?? 0,
        firstWorkDate: c.firstWorkDate || null,
        hasActiveProject: c.hasActiveProject ?? false,
        activeProjectName: c.projectName || null,
        activeProjectType: c.projectType || null,
      })
      .onConflictDoUpdate({
        target: clients.legacyId,
        set: {
          name: c.name,
          kind: c.kind,
          phone: c.phone || null,
          acquisitionChannel: c.acquisitionChannel || null,
          totalSpentMxn: String(c.totalSpent ?? 0),
          totalProjectsWorked: c.totalProjectsWorked ?? 0,
          firstWorkDate: c.firstWorkDate || null,
          hasActiveProject: c.hasActiveProject ?? false,
          activeProjectName: c.projectName || null,
          activeProjectType: c.projectType || null,
        },
      })
      .returning({ id: clients.id });

    // Replace contacts for this client (they carry no stable id from the UI).
    await db
      .delete(clientContacts)
      .where(eq(clientContacts.clientId, row.id));
    if (c.contacts.length > 0) {
      await db.insert(clientContacts).values(
        c.contacts
          .filter((ct) => ct.name || ct.email || ct.phone)
          .map((ct, i) => ({
            clientId: row.id,
            name: ct.name,
            role: ct.role || null,
            phone: ct.phone || null,
            email: ct.email || null,
            sortOrder: i,
          }))
      );
    }
  }

  revalidatePath("/clientes");
  revalidatePath("/proyectos");
}

export async function deleteClientAction(
  clientLegacyId: number,
  linkedProjectLegacyIds: number[]
): Promise<void> {
  const caps = await requireClientsCapabilities();
  if (!caps.canDeleteClient) {
    throw new Error("FORBIDDEN: clients delete");
  }

  const now = new Date();

  const [clientRow] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.legacyId, clientLegacyId))
    .limit(1);

  if (clientRow) {
    await db
      .update(projects)
      .set({ deletedAt: now })
      .where(and(eq(projects.clientId, clientRow.id), isNull(projects.deletedAt)));
  }

  if (linkedProjectLegacyIds.length > 0) {
    await db
      .update(projects)
      .set({ deletedAt: now })
      .where(inArray(projects.legacyId, linkedProjectLegacyIds));
  }

  await db
    .update(clients)
    .set({ deletedAt: now })
    .where(eq(clients.legacyId, clientLegacyId));

  revalidatePath("/clientes");
  revalidatePath("/proyectos");
}
