import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  projectSchedules,
  projects,
  scheduleAdicionales,
  scheduleImprevistos,
  schedulePaymentRows,
  scheduleTasks,
} from "@/lib/db/schema";
import type { Adicional, CronogramaData, Imprevisto, PaymentRow, ScheduleTask } from "@/lib/types/schedule";

function projectAddress(row: { addressStreet: string | null; addressCity: string | null; addressState: string | null }): string | null {
  const parts = [row.addressStreet, row.addressCity, row.addressState].filter((p): p is string => Boolean(p?.trim()));
  return parts.length ? parts.join(", ") : null;
}

/** One round trip: project + schedule + its tasks/payments/imprevistos/adicionales. Null if the project has no schedule imported yet. */
export async function getScheduleForProject(projectId: string): Promise<CronogramaData | null> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return null;

  const schedule = await db.query.projectSchedules.findFirst({
    where: eq(projectSchedules.projectId, projectId),
  });
  if (!schedule) return null;

  const [taskRows, paymentRows, imprevistoRows, adicionalRows] = await Promise.all([
    db.query.scheduleTasks.findMany({
      where: eq(scheduleTasks.scheduleId, schedule.id),
      orderBy: [asc(scheduleTasks.sortOrder)],
    }),
    db.query.schedulePaymentRows.findMany({
      where: eq(schedulePaymentRows.scheduleId, schedule.id),
      orderBy: [asc(schedulePaymentRows.fecha)],
    }),
    db.query.scheduleImprevistos.findMany({
      where: eq(scheduleImprevistos.scheduleId, schedule.id),
      orderBy: [asc(scheduleImprevistos.fecha)],
    }),
    db.query.scheduleAdicionales.findMany({
      where: eq(scheduleAdicionales.scheduleId, schedule.id),
      orderBy: [asc(scheduleAdicionales.sortOrder)],
    }),
  ]);

  const tasks: ScheduleTask[] = taskRows.map((t) => ({
    id: t.id,
    stableKey: t.stableKey,
    legacyId: t.legacyId,
    planta: t.planta,
    seccion: t.seccion,
    responsable: t.responsable,
    inicio: t.inicio,
    fin: t.fin,
    tarea: t.tarea,
    status: t.status,
    flagged: t.flagged,
  }));

  const payments: PaymentRow[] = paymentRows.map((p) => ({
    fecha: p.fecha,
    pagadoPct: Number(p.pagadoPct),
    avancePct: Number(p.avancePct),
  }));

  const imprevistos: Imprevisto[] = imprevistoRows.map((i) => ({
    id: i.id,
    fecha: i.fecha,
    texto: i.texto,
  }));

  const adicionales: Adicional[] = adicionalRows.map((a) => ({
    partida: a.partida,
    items: a.items,
  }));

  return {
    project: { id: project.id, name: project.name, address: projectAddress(project) },
    schedule: { id: schedule.id, version: schedule.version, paymentCalendarLabel: schedule.paymentCalendarLabel },
    tasks,
    payments,
    imprevistos,
    adicionales,
  };
}
