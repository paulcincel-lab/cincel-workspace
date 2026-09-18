/**
 * One-time Cronograma de Obra seed for the Madrid 22 project.
 *
 * Populates project_schedules + schedule_tasks/payment_rows/imprevistos/
 * adicionales from the reference dashboard's own data, extracted once into
 * scripts/data/md22-*.json (see docs/specs/backend.md §8.3 and §9.3). Tasks
 * are seeded at status "pending" — the client's real completion snapshot is
 * applied afterwards through the legacy-JSON import path (backend.md §8.2),
 * not by this script.
 *
 * Idempotent: re-running it replaces this project's schedule tasks/payment
 * rows/imprevistos/adicionales (matched by the schedule's unique projectId)
 * rather than duplicating them.
 *
 * Run with: npx tsx scripts/seed-madrid22.ts <projectId>
 *   or:     SCHEDULE_SEED_PROJECT_ID=<uuid> npx tsx scripts/seed-madrid22.ts
 */
import { eq, ilike } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";
import { stableKey } from "../lib/cronograma/hash";
import { SECTION_ORDER } from "../lib/cronograma/sections";

import rawTasks from "./data/md22-raw-tasks.json";
import rawPagos from "./data/md22-pagos-calendar.json";
import rawImprevistos from "./data/md22-imprevistos.json";
import rawAdicionales from "./data/md22-adicionales.json";

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

type RawTask = { id: string; planta: string; seccion: string; responsable: string; inicio: string; fin: string; tarea: string };
type RawPago = { fecha: string; pagado: number; avance: number };
type RawImprevisto = { id: string; fecha: string; texto: string };
type RawAdicional = { partida: string; items: string[] };

function seccionOrder(seccion: string): number {
  const i = SECTION_ORDER.indexOf(seccion);
  return i === -1 ? SECTION_ORDER.length : i;
}

async function resolveProjectId(): Promise<string> {
  const fromArgs = process.argv[2];
  const fromEnv = process.env.SCHEDULE_SEED_PROJECT_ID;
  const explicit = fromArgs ?? fromEnv;
  if (explicit) return explicit;

  const match = await db.query.projects.findFirst({
    where: ilike(schema.projects.name, "%Madrid 22%"),
  });
  if (!match) {
    throw new Error(
      "No project id given and no project matching '%Madrid 22%' was found. " +
        "Run: npx tsx scripts/seed-madrid22.ts <projectId>, or set SCHEDULE_SEED_PROJECT_ID."
    );
  }
  return match.id;
}

async function main() {
  const projectId = await resolveProjectId();

  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) throw new Error(`Project ${projectId} does not exist.`);

  const [schedule] = await db
    .insert(schema.projectSchedules)
    .values({
      projectId,
      version: 1,
      sourceFileName: "Reporte Cronograma Madrid 22 - 2026-08-21.html",
      paymentCalendarLabel: "Calendario de Pagos Madrid 22 V1.4",
    })
    .onConflictDoUpdate({
      target: schema.projectSchedules.projectId,
      set: { version: 1, sourceFileName: "Reporte Cronograma Madrid 22 - 2026-08-21.html" },
    })
    .returning();

  // Idempotent re-seed: replace this schedule's children rather than duplicate them.
  await db.delete(schema.scheduleTasks).where(eq(schema.scheduleTasks.scheduleId, schedule.id));
  await db.delete(schema.schedulePaymentRows).where(eq(schema.schedulePaymentRows.scheduleId, schedule.id));
  await db.delete(schema.scheduleImprevistos).where(eq(schema.scheduleImprevistos.scheduleId, schedule.id));
  await db.delete(schema.scheduleAdicionales).where(eq(schema.scheduleAdicionales.scheduleId, schedule.id));

  const tasks = rawTasks as RawTask[];
  // A handful of rows in the source data share identical (planta, tarea) text
  // (e.g. two "Suministro de Llave Angular..." rows), which would collide on
  // the same stableKey. Disambiguate with the row's own legacyId suffix and
  // warn — a live re-import would instead reject this as a collision
  // (backend.md §9), but a one-time seed just needs distinct rows.
  const seenKeys = new Set<string>();
  await db.insert(schema.scheduleTasks).values(
    tasks.map((t, i) => {
      let key = stableKey(t.planta, t.tarea);
      if (seenKeys.has(key)) {
        console.warn(`  duplicate (planta, tarea) collision on ${key} (legacyId ${t.id}) — disambiguating`);
        key = `${key}-${t.id}`;
      }
      seenKeys.add(key);
      return {
        scheduleId: schedule.id,
        stableKey: key,
        legacyId: t.id,
        planta: t.planta,
        seccion: t.seccion,
        seccionOrder: seccionOrder(t.seccion),
        responsable: t.responsable,
        inicio: t.inicio,
        fin: t.fin,
        tarea: t.tarea,
        sortOrder: i,
      };
    })
  );

  const pagos = rawPagos as RawPago[];
  await db.insert(schema.schedulePaymentRows).values(
    pagos.map((p) => ({
      scheduleId: schedule.id,
      fecha: p.fecha,
      pagadoPct: String(p.pagado),
      avancePct: String(p.avance),
    }))
  );

  const imprevistos = rawImprevistos as RawImprevisto[];
  await db.insert(schema.scheduleImprevistos).values(
    imprevistos.map((imp) => ({
      scheduleId: schedule.id,
      fecha: imp.fecha,
      texto: imp.texto,
    }))
  );

  const adicionales = rawAdicionales as RawAdicional[];
  await db.insert(schema.scheduleAdicionales).values(
    adicionales.map((a, i) => ({
      scheduleId: schedule.id,
      partida: a.partida,
      items: a.items,
      quoteRef: "MD22_04 · Adicionales 01",
      sortOrder: i,
    }))
  );

  console.log(`Seeded Cronograma for project ${project.name} (${projectId}):`);
  console.log(`  schedule_tasks: ${tasks.length}`);
  console.log(`  schedule_payment_rows: ${pagos.length}`);
  console.log(`  schedule_imprevistos: ${imprevistos.length}`);
  console.log(`  schedule_adicionales: ${adicionales.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
