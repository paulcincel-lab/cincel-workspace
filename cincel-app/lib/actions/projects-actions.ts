"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  clientContacts,
  clients,
  projectDriveLinks,
  projectMembers,
  projects,
  teamMembers,
} from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import type { Project } from "@/lib/repositories/projects-repository";

async function requireProjectsCapabilities() {
  return resolveProjectsCapabilities(await requireCapabilityUser());
}

type ProjectRow = {
  legacyId: number | null;
  code: string | null;
  name: string;
  status: string | null;
  active: boolean;
  projectType: string | null;
  stage: string | null;
  phase: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  managerName: string | null;
  coordinatorName: string | null;
  progress: number;
  startDate: string | null;
  client: {
    legacyId: number | null;
    name: string;
    kind: string;
    phone: string | null;
    acquisitionChannel: string | null;
    totalSpentMxn: string;
    contacts: Array<{
      name: string;
      role: string | null;
      phone: string | null;
      email: string | null;
    }>;
  } | null;
  driveLinks: {
    administrativoUrl: string | null;
    planosUrl: string | null;
    rendersUrl: string | null;
    reportesUrl: string | null;
  } | null;
  members: Array<{ memberNameSnapshot: string | null }>;
};

function toProject(row: ProjectRow): Project {
  const contacts =
    row.client?.contacts.map((c) => ({
      name: c.name,
      role: c.role ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    })) ?? [];

  return {
    id: row.legacyId ?? 0,
    code: row.code ?? "",
    name: row.name,
    active: row.active,
    status: row.status ?? "Activo",
    client: {
      id: row.client?.legacyId ?? 0,
      name: row.client?.name ?? "",
      emails: contacts.map((c) => c.email).filter(Boolean),
      phone: row.client?.phone ?? "",
      kind: row.client?.kind === "Empresa" ? "Empresa" : "Particular",
      contacts,
      completedProjects: [],
      acquisitionChannel: row.client?.acquisitionChannel ?? "",
      totalSpent: Number(row.client?.totalSpentMxn ?? 0),
    },
    type: row.projectType ?? "",
    stage: row.stage ?? "",
    phase: row.phase ?? "",
    address: {
      street: row.addressStreet ?? "",
      city: row.addressCity ?? "",
      state: row.addressState ?? "",
    },
    manager: row.managerName ?? "",
    coordinator: row.coordinatorName ?? "",
    team: row.members
      .map((m) => m.memberNameSnapshot)
      .filter((n): n is string => Boolean(n)),
    progress: row.progress,
    startDate: row.startDate ?? "",
    drive: {
      administrativo: row.driveLinks?.administrativoUrl ?? "",
      planos: row.driveLinks?.planosUrl ?? "",
      renders: row.driveLinks?.rendersUrl ?? "",
      reportes: row.driveLinks?.reportesUrl ?? "",
    },
  };
}

export async function fetchProjectsAction(): Promise<Project[]> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return [];

  const rows = await db.query.projects.findMany({
    where: isNull(projects.deletedAt),
    orderBy: asc(projects.name),
    with: {
      client: {
        with: {
          contacts: {
            where: isNull(clientContacts.deletedAt),
            orderBy: asc(clientContacts.sortOrder),
          },
        },
      },
      driveLinks: true,
      members: true,
    },
  });

  return rows.map((r) => toProject(r as unknown as ProjectRow));
}

export async function saveProjectsAction(list: Project[]): Promise<void> {
  const caps = await requireProjectsCapabilities();
  if (
    !caps.canCreateProject &&
    !caps.canEditProjectGeneral &&
    !caps.canArchiveProject &&
    !caps.canChangeProjectStage
  ) {
    throw new Error("FORBIDDEN: projects write");
  }

  for (const p of list) {
    // Resolve the owning client by legacy id. Projects created through the app
    // always carry a client that already exists (created via the clients flow
    // or seeded), so this is a lookup, not an upsert.
    let clientId: string | null = null;
    if (p.client?.id) {
      const [clientRow] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.legacyId, p.client.id))
        .limit(1);
      clientId = clientRow?.id ?? null;
    }

    const values = {
      code: p.code || null,
      name: p.name,
      status: p.status || null,
      active: p.active ?? true,
      clientId,
      projectType: p.type || null,
      stage: p.stage || null,
      phase: p.phase || null,
      addressStreet: p.address?.street || null,
      addressCity: p.address?.city || null,
      addressState: p.address?.state || null,
      managerName: p.manager || null,
      coordinatorName: p.coordinator || null,
      progress: p.progress ?? 0,
      startDate: p.startDate || null,
    };

    const [row] = await db
      .insert(projects)
      .values({ legacyId: p.id, ...values })
      .onConflictDoUpdate({ target: projects.legacyId, set: values })
      .returning({ id: projects.id });

    await db
      .insert(projectDriveLinks)
      .values({
        projectId: row.id,
        administrativoUrl: p.drive?.administrativo || null,
        planosUrl: p.drive?.planos || null,
        rendersUrl: p.drive?.renders || null,
        reportesUrl: p.drive?.reportes || null,
      })
      .onConflictDoUpdate({
        target: projectDriveLinks.projectId,
        set: {
          administrativoUrl: p.drive?.administrativo || null,
          planosUrl: p.drive?.planos || null,
          rendersUrl: p.drive?.renders || null,
          reportesUrl: p.drive?.reportes || null,
        },
      });

    // Members carry no stable id from the UI (they are plain names) — replace.
    await db.delete(projectMembers).where(eq(projectMembers.projectId, row.id));
    const names = (p.team ?? []).filter(Boolean);
    if (names.length > 0) {
      const known = await db
        .select({ id: teamMembers.id, name: teamMembers.name })
        .from(teamMembers);
      const byName = new Map(known.map((m) => [m.name, m.id]));
      await db.insert(projectMembers).values(
        names.map((name) => ({
          projectId: row.id,
          teamMemberId: byName.get(name) ?? null,
          memberNameSnapshot: name,
        }))
      );
    }
  }

  revalidatePath("/proyectos");
  revalidatePath("/clientes");
  revalidatePath("/equipo");
}

export async function deleteProjectAction(projectLegacyId: number): Promise<void> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canDeleteProject) {
    throw new Error("FORBIDDEN: projects delete");
  }

  await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(projects.legacyId, projectLegacyId), isNull(projects.deletedAt))
    );

  revalidatePath("/proyectos");
  revalidatePath("/clientes");
}
