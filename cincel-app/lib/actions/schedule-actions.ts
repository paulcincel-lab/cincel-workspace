"use server";

import { revalidatePath } from "next/cache";
import { and, eq, notInArray, sql } from "drizzle-orm";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { projectSchedules, scheduleImprevistos, scheduleTaskEvents, scheduleTasks } from "@/lib/db/schema";
import * as scheduleRepository from "@/lib/repositories/schedule-repository";
import { computeImportDiff } from "@/lib/cronograma/import/diff";
import { parseScheduleExcel } from "@/lib/cronograma/import/parse-excel";
import { parseLegacyState } from "@/lib/cronograma/import/parse-json";
import { SECTION_ORDER } from "@/lib/cronograma/sections";
import type {
  ActionResult,
  CronogramaData,
  Imprevisto,
  ImportDiffSummary,
  LegacyStateApplyResult,
  ScheduleStatus,
} from "@/lib/types/schedule";

async function requireProjectsCapabilities() {
  return resolveProjectsCapabilities(await requireCapabilityUser());
}

async function requireEditCapabilities() {
  const user = await requireCapabilityUser();
  const caps = resolveProjectsCapabilities(user);
  return { user, caps };
}

function forbidden(): { ok: false; error: string } {
  return { ok: false, error: "No tienes permiso para editar este cronograma." };
}

function revalidateSchedule(projectId: string) {
  revalidatePath(`/proyectos/${projectId}/cronograma`);
}

function seccionOrderOf(seccion: string): number {
  const i = SECTION_ORDER.indexOf(seccion);
  return i === -1 ? SECTION_ORDER.length : i;
}

/** The project's timezone for "today" — every viewer gets the same date/week regardless of their own clock. */
const SCHEDULE_TIMEZONE = "America/Mexico_City";

function todayInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

export interface ScheduleViewData {
  data: CronogramaData;
  today: string;
}

export async function fetchScheduleAction(projectId: string): Promise<ScheduleViewData | null> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return null;

  const data = await scheduleRepository.getScheduleForProject(projectId);
  if (!data) return null;

  return { data, today: todayInTimezone(SCHEDULE_TIMEZONE) };
}

// ── Mutations ────────────────────────────────────────────────────────────

export type SetTaskStatusResult =
  | { ok: true; status: ScheduleStatus }
  | { ok: false; conflict: true; current: ScheduleStatus }
  | { ok: false; conflict: false; error: string };

export async function setTaskStatusAction(
  taskId: string,
  next: ScheduleStatus,
  expectedStatus: ScheduleStatus
): Promise<SetTaskStatusResult> {
  const { user, caps } = await requireEditCapabilities();
  if (!caps.canEditProjectGeneral) {
    return { ok: false, conflict: false, error: "No tienes permiso para editar este cronograma." };
  }

  const task = await db.query.scheduleTasks.findFirst({ where: eq(scheduleTasks.id, taskId) });
  if (!task) return { ok: false, conflict: false, error: "Tarea no encontrada." };
  if (task.status !== expectedStatus) {
    return { ok: false, conflict: true, current: task.status };
  }

  const schedule = await db.query.projectSchedules.findFirst({ where: eq(projectSchedules.id, task.scheduleId) });

  await db.transaction(async (tx) => {
    await tx
      .update(scheduleTasks)
      .set({ status: next, statusUpdatedAt: new Date(), statusUpdatedBy: user.member.id })
      .where(eq(scheduleTasks.id, taskId));
    await tx.insert(scheduleTaskEvents).values({
      taskId,
      taskStableKey: task.stableKey,
      from: task.status,
      to: next,
      userId: user.member.id,
    });
  });

  if (schedule) revalidateSchedule(schedule.projectId);
  return { ok: true, status: next };
}

export async function toggleTaskFlagAction(taskId: string): Promise<ActionResult<{ flagged: boolean }>> {
  const { caps } = await requireEditCapabilities();
  if (!caps.canEditProjectGeneral) return forbidden();

  const task = await db.query.scheduleTasks.findFirst({ where: eq(scheduleTasks.id, taskId) });
  if (!task) return { ok: false, error: "Tarea no encontrada." };

  const schedule = await db.query.projectSchedules.findFirst({ where: eq(projectSchedules.id, task.scheduleId) });
  const next = !task.flagged;
  await db.update(scheduleTasks).set({ flagged: next }).where(eq(scheduleTasks.id, taskId));

  if (schedule) revalidateSchedule(schedule.projectId);
  return { ok: true, data: { flagged: next } };
}

export async function addImprevistoAction(
  scheduleId: string,
  input: { fecha: string; texto: string }
): Promise<ActionResult<Imprevisto>> {
  const { user, caps } = await requireEditCapabilities();
  if (!caps.canEditProjectGeneral) return forbidden();

  const texto = input.texto.trim();
  if (!texto) return { ok: false, error: "El texto no puede estar vacío." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { ok: false, error: "Fecha inválida." };

  const schedule = await db.query.projectSchedules.findFirst({ where: eq(projectSchedules.id, scheduleId) });
  if (!schedule) return { ok: false, error: "Cronograma no encontrado." };

  const [row] = await db
    .insert(scheduleImprevistos)
    .values({ scheduleId, fecha: input.fecha, texto, createdBy: user.member.id })
    .returning();

  revalidateSchedule(schedule.projectId);
  return { ok: true, data: { id: row.id, fecha: row.fecha, texto: row.texto } };
}

export async function deleteImprevistoAction(id: string): Promise<ActionResult<{ id: string }>> {
  const { caps } = await requireEditCapabilities();
  if (!caps.canEditProjectGeneral) return forbidden();

  const row = await db.query.scheduleImprevistos.findFirst({ where: eq(scheduleImprevistos.id, id) });
  if (!row) return { ok: false, error: "No encontrado." };
  const schedule = await db.query.projectSchedules.findFirst({ where: eq(projectSchedules.id, row.scheduleId) });

  await db.delete(scheduleImprevistos).where(eq(scheduleImprevistos.id, id));
  if (schedule) revalidateSchedule(schedule.projectId);
  return { ok: true, data: { id } };
}

// ── Import ───────────────────────────────────────────────────────────────

function fileFromFormData(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File ? file : null;
}

export async function previewImportScheduleAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<ImportDiffSummary>> {
  const { caps } = await requireEditCapabilities();
  if (!caps.canEditProjectGeneral) return forbidden();

  const file = fileFromFormData(formData);
  if (!file) return { ok: false, error: "No se recibió ningún archivo." };

  const parsed = parseScheduleExcel(await file.arrayBuffer());
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const schedule = await db.query.projectSchedules.findFirst({ where: eq(projectSchedules.projectId, projectId) });
  const existingTasks = schedule
    ? await db.query.scheduleTasks.findMany({
        where: eq(scheduleTasks.scheduleId, schedule.id),
        columns: { stableKey: true, tarea: true },
      })
    : [];

  return { ok: true, data: computeImportDiff(existingTasks, parsed.tasks) };
}

export async function commitImportScheduleAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult<ImportDiffSummary>> {
  const { caps } = await requireEditCapabilities();
  if (!caps.canEditProjectGeneral) return forbidden();

  const file = fileFromFormData(formData);
  if (!file) return { ok: false, error: "No se recibió ningún archivo." };

  const parsed = parseScheduleExcel(await file.arrayBuffer());
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const incoming = parsed.tasks;

  let schedule = await db.query.projectSchedules.findFirst({ where: eq(projectSchedules.projectId, projectId) });
  const existingTasks = schedule
    ? await db.query.scheduleTasks.findMany({
        where: eq(scheduleTasks.scheduleId, schedule.id),
        columns: { stableKey: true, tarea: true },
      })
    : [];
  const diff = computeImportDiff(existingTasks, incoming);

  await db.transaction(async (tx) => {
    if (!schedule) {
      [schedule] = await tx
        .insert(projectSchedules)
        .values({ projectId, version: 1, sourceFileName: file.name })
        .returning();
    } else {
      await tx
        .update(projectSchedules)
        .set({ version: sql`${projectSchedules.version} + 1`, sourceFileName: file.name })
        .where(eq(projectSchedules.id, schedule.id));
    }
    const scheduleId = schedule.id;

    if (incoming.length > 0) {
      await tx
        .insert(scheduleTasks)
        .values(
          incoming.map((t, i) => ({
            scheduleId,
            stableKey: t.stableKey,
            legacyId: t.legacyId,
            planta: t.planta,
            seccion: t.seccion,
            seccionOrder: seccionOrderOf(t.seccion),
            responsable: t.responsable,
            inicio: t.inicio,
            fin: t.fin,
            tarea: t.tarea,
            sortOrder: i,
          }))
        )
        .onConflictDoUpdate({
          target: [scheduleTasks.scheduleId, scheduleTasks.stableKey],
          set: {
            legacyId: sql`excluded.legacy_id`,
            planta: sql`excluded.planta`,
            seccion: sql`excluded.seccion`,
            seccionOrder: sql`excluded.seccion_order`,
            responsable: sql`excluded.responsable`,
            inicio: sql`excluded.inicio`,
            fin: sql`excluded.fin`,
            tarea: sql`excluded.tarea`,
            sortOrder: sql`excluded.sort_order`,
            updatedAt: new Date(),
          },
        });

      await tx
        .delete(scheduleTasks)
        .where(
          and(
            eq(scheduleTasks.scheduleId, scheduleId),
            notInArray(
              scheduleTasks.stableKey,
              incoming.map((t) => t.stableKey)
            )
          )
        );
    }
  });

  revalidateSchedule(projectId);
  return { ok: true, data: diff };
}

export async function importLegacyStateAction(
  scheduleId: string,
  rawJson: string
): Promise<ActionResult<LegacyStateApplyResult>> {
  const { user, caps } = await requireEditCapabilities();
  if (!caps.canEditProjectGeneral) return forbidden();

  const parsed = parseLegacyState(rawJson);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const schedule = await db.query.projectSchedules.findFirst({ where: eq(projectSchedules.id, scheduleId) });
  if (!schedule) return { ok: false, error: "Cronograma no encontrado." };

  const tasks = await db.query.scheduleTasks.findMany({ where: eq(scheduleTasks.scheduleId, scheduleId) });
  const byKey = new Map(tasks.map((t) => [t.stableKey, t]));

  const matchedKeys = new Set<string>();
  const unmatchedKeys = new Set<string>();

  await db.transaction(async (tx) => {
    for (const [key, status] of Object.entries(parsed.state.statusByKey)) {
      const task = byKey.get(key);
      if (!task) {
        unmatchedKeys.add(key);
        continue;
      }
      matchedKeys.add(key);
      if (task.status !== status) {
        await tx
          .update(scheduleTasks)
          .set({ status, statusUpdatedAt: new Date() })
          .where(eq(scheduleTasks.id, task.id));
        await tx.insert(scheduleTaskEvents).values({
          taskId: task.id,
          taskStableKey: key,
          from: task.status,
          to: status,
          userId: user.member.id,
        });
      }
    }

    for (const [key, flagged] of Object.entries(parsed.state.flagByKey)) {
      const task = byKey.get(key);
      if (!task) {
        unmatchedKeys.add(key);
        continue;
      }
      matchedKeys.add(key);
      if (task.flagged !== flagged) {
        await tx.update(scheduleTasks).set({ flagged }).where(eq(scheduleTasks.id, task.id));
      }
    }

    if (parsed.state.imprevistos.length > 0) {
      await tx.insert(scheduleImprevistos).values(
        parsed.state.imprevistos.map((i) => ({
          scheduleId,
          fecha: i.fecha,
          texto: i.texto,
          createdBy: user.member.id,
        }))
      );
    }
  });

  revalidateSchedule(schedule.projectId);
  return { ok: true, data: { matchedCount: matchedKeys.size, unmatchedKeys: [...unmatchedKeys] } };
}
