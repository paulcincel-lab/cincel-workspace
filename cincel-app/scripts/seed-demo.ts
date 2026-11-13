/**
 * Demo data (redesign polish, issue #921): the canvas's sample firm, so every
 * Inicio widget, the three Tareas views, Proyecto, Personas and Mi espacio
 * show real content on a fresh local database instead of empty states.
 *
 *   - 5 people (Paul Langarica, Alejandro Riofrio, María González, Luis
 *     Ramírez, Sofía Castro); the roster's "Paul" and "Alejandro" are reused
 *   - the 6 canvas projects (Local Espinopapa, Guadalajara 83, Madrid 22,
 *     Salim Ortopedia, Casa Lomas, Oficinas Roma) with clients, etapas and
 *     team, plus the "Workspace" internal project (paused, so the active
 *     count stays 6 as in the canvas)
 *   - about 30 open tasks across Pendiente, En proceso and Vencida (open with
 *     a past date), a few completed ones, subtasks and support staff
 *   - dated tasks for today (the Mi día agenda and the calendar), reminders,
 *     notes and checklists for the signed-in admin
 *   - contractors and suppliers for Personas
 *
 * Dates are relative to today (America/Mexico_City), so overdue and upcoming
 * items stay meaningful whenever the seed runs.
 *
 * Local and dev only: refuses NODE_ENV=production and any DATABASE_URL whose
 * host is not local (scripts/seed-demo-guard.ts). Run `npm run db:seed` first
 * (workflows, roster, admin login), then:
 *
 *   npm run db:seed:demo
 *
 * Idempotent: people, contacts and projects are matched by name; each demo
 * project's demo tasks and the owner's demo notes, checklists and reminders
 * are replaced, not duplicated. Nothing else is touched.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";
import { assertDemoSeedAllowed } from "./seed-demo-guard";

const connectionString = assertDemoSeedAllowed(process.env);

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

const TIME_ZONE = "America/Mexico_City";
/** Mexico City has no DST: a fixed offset is exact. */
const TZ_OFFSET = "-06:00";
const OWNER_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? "paul@cincel.mx").trim().toLowerCase();

// ── Dates ───────────────────────────────────────────────────────────────────

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

const TODAY = todayIn(TIME_ZONE);

/** YYYY-MM-DD `offset` days from today. */
function day(offset: number): string {
  const [y, m, d] = TODAY.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + offset));
  return at.toISOString().slice(0, 10);
}

/** An instant `offset` days from today at local `hh:mm`. */
function at(offset: number, time: string): Date {
  return new Date(`${day(offset)}T${time}:00${TZ_OFFSET}`);
}

// ── People ──────────────────────────────────────────────────────────────────

type PersonKey = "PL" | "AR" | "MG" | "LR" | "SC";

const PEOPLE: ReadonlyArray<{
  key: PersonKey;
  name: string;
  /** Roster first name to reuse when present (scripts/seed.ts). */
  rosterName?: string;
  role: string;
  email: string;
  capacity: number;
}> = [
  { key: "PL", name: "Paul Langarica Soubic", rosterName: "Paul", role: "Residente de obra", email: "paul@cincel.mx", capacity: 12 },
  { key: "AR", name: "Alejandro Riofrio", rosterName: "Alejandro", role: "Administrador · dirección", email: "alejandro@cincel.mx", capacity: 10 },
  { key: "MG", name: "María González", role: "Arquitecta de diseño", email: "maria.gonzalez@cincel.mx", capacity: 10 },
  { key: "LR", name: "Luis Ramírez", role: "Diseño de interiores", email: "luis.ramirez@cincel.mx", capacity: 8 },
  { key: "SC", name: "Sofía Castro", role: "Ventas y presupuestos", email: "sofia.castro@cincel.mx", capacity: 8 },
];

async function findLiveStaffByName(name: string) {
  return db.query.staff.findFirst({
    where: sql`lower(${schema.staff.name}) = lower(${name}) and ${schema.staff.deletedAt} is null`,
  });
}

async function findLiveStaffByEmail(email: string) {
  return db.query.staff.findFirst({
    where: sql`lower(${schema.staff.email}) = lower(${email}) and ${schema.staff.deletedAt} is null`,
  });
}

async function seedPeople(): Promise<Map<PersonKey, string>> {
  const ids = new Map<PersonKey, string>();
  for (const p of PEOPLE) {
    const existing =
      (await findLiveStaffByName(p.name)) ??
      (p.rosterName ? await findLiveStaffByName(p.rosterName) : undefined) ??
      (await findLiveStaffByEmail(p.email));
    if (existing) {
      // Roster people keep their name, role and email; only fill gaps.
      if (!existing.lastName && p.rosterName && existing.name === p.rosterName) {
        await db
          .update(schema.staff)
          .set({ lastName: p.name.slice(p.rosterName.length).trim() || null })
          .where(eq(schema.staff.id, existing.id));
      }
      ids.set(p.key, existing.id);
      continue;
    }
    const [row] = await db
      .insert(schema.staff)
      .values({
        kind: "empleado",
        name: p.name,
        role: p.role,
        email: p.email,
        capacity: p.capacity,
        availability: "Disponible",
        active: true,
      })
      .returning({ id: schema.staff.id });
    ids.set(p.key, row.id);
  }
  console.log(`  people: ${ids.size} ready`);
  return ids;
}

// ── Contacts ────────────────────────────────────────────────────────────────

type ContactSeed = {
  type: "cliente" | "proveedor";
  kind: "empresa" | "particular";
  name: string;
  location?: string;
  provider?: {
    subtype: "contratista" | "colaborador" | "tienda";
    mainSpecialty: string;
    availability?: string;
    rating?: number;
  };
};

const CLIENTS: ReadonlyArray<ContactSeed & { project: string }> = [
  { type: "cliente", kind: "empresa", name: "Espinopapa", location: "CDMX", project: "Local Espinopapa" },
  { type: "cliente", kind: "particular", name: "Cliente Guadalajara 83", location: "Condesa", project: "Guadalajara 83" },
  { type: "cliente", kind: "particular", name: "Cliente Madrid 22", location: "Juárez", project: "Madrid 22" },
  { type: "cliente", kind: "empresa", name: "Salim Ortopedia", location: "Polanco", project: "Salim Ortopedia" },
  { type: "cliente", kind: "particular", name: "Cliente Lomas", location: "Lomas", project: "Casa Lomas" },
  { type: "cliente", kind: "empresa", name: "Oficinas Roma", location: "Roma Norte", project: "Oficinas Roma" },
];

const PROVIDERS: ReadonlyArray<ContactSeed> = [
  { type: "proveedor", kind: "empresa", name: "Proveedor de pisos A", provider: { subtype: "tienda", mainSpecialty: "Pisos", availability: "5 días" } },
  { type: "proveedor", kind: "empresa", name: "Proveedor de pisos B", provider: { subtype: "tienda", mainSpecialty: "Pisos", availability: "3 días" } },
  { type: "proveedor", kind: "empresa", name: "Proveedor de pisos C", provider: { subtype: "tienda", mainSpecialty: "Pisos", availability: "12 días" } },
  { type: "proveedor", kind: "empresa", name: "Iluminación Norte", provider: { subtype: "tienda", mainSpecialty: "Iluminación", availability: "8 días" } },
  { type: "proveedor", kind: "empresa", name: "Taller de Mobiliario Encino", provider: { subtype: "colaborador", mainSpecialty: "Mobiliario", availability: "4 semanas" } },
  { type: "proveedor", kind: "empresa", name: "Estudio de Render", provider: { subtype: "colaborador", mainSpecialty: "Renders", availability: "6 días" } },
  { type: "proveedor", kind: "empresa", name: "Piedra y Mármol del Centro", provider: { subtype: "tienda", mainSpecialty: "Piedra", availability: "10 días" } },
  { type: "proveedor", kind: "empresa", name: "Albañilería Hernández", provider: { subtype: "contratista", mainSpecialty: "Albañilería", rating: 5 } },
  { type: "proveedor", kind: "empresa", name: "Herrería del Valle", provider: { subtype: "contratista", mainSpecialty: "Herrería", rating: 4 } },
  { type: "proveedor", kind: "empresa", name: "Cancelería Moderna", provider: { subtype: "contratista", mainSpecialty: "Cancelería", availability: "3 semanas", rating: 4 } },
  { type: "proveedor", kind: "empresa", name: "Instalaciones Eléctricas Rivas", provider: { subtype: "contratista", mainSpecialty: "Eléctrico", rating: 3 } },
  { type: "proveedor", kind: "empresa", name: "Hidráulica Torres", provider: { subtype: "contratista", mainSpecialty: "Hidráulico", rating: 4 } },
  { type: "proveedor", kind: "empresa", name: "Pisos y Acabados Luna", provider: { subtype: "contratista", mainSpecialty: "Acabados", rating: 5 } },
];

async function upsertContact(c: ContactSeed): Promise<string> {
  const existing = await db.query.contacts.findFirst({
    where: sql`${schema.contacts.type} = ${c.type} and lower(${schema.contacts.name}) = lower(${c.name}) and ${schema.contacts.deletedAt} is null`,
  });
  const id =
    existing?.id ??
    (
      await db
        .insert(schema.contacts)
        .values({ type: c.type, kind: c.kind, name: c.name, location: c.location ?? null })
        .returning({ id: schema.contacts.id })
    )[0].id;
  if (c.provider) {
    const profile = {
      subtype: c.provider.subtype,
      status: "activo" as const,
      mainSpecialty: c.provider.mainSpecialty,
      availability: c.provider.availability ?? null,
      rating: c.provider.rating ?? null,
    };
    await db
      .insert(schema.providerProfiles)
      .values({ contactId: id, ...profile })
      .onConflictDoUpdate({ target: schema.providerProfiles.contactId, set: profile });
  }
  return id;
}

async function seedContacts(): Promise<{ clients: Map<string, string>; providers: Map<string, string> }> {
  const clients = new Map<string, string>();
  for (const c of CLIENTS) clients.set(c.project, await upsertContact(c));
  const providers = new Map<string, string>();
  for (const p of PROVIDERS) providers.set(p.name, await upsertContact(p));
  console.log(`  contacts: ${clients.size} clients, ${providers.size} providers ready`);
  return { clients, providers };
}

// ── Projects ────────────────────────────────────────────────────────────────

type EtapaKey = "presale" | "diseno" | "construccion";

const PROJECTS: ReadonlyArray<{
  name: string;
  code: string;
  projectType: string;
  city: string;
  /** Decoración was retired as an etapa (migration 0010); the canvas's Madrid 22 runs in Construcción. */
  etapa: EtapaKey;
  progress: number;
  start: number;
  end: number;
  manager: PersonKey;
  members: PersonKey[];
  contractors: string[];
  status?: "activo" | "pausado";
}> = [
  { name: "Local Espinopapa", code: "ESP-01", projectType: "Local comercial", city: "CDMX", etapa: "construccion", progress: 82, start: -120, end: 20, manager: "PL", members: ["PL", "AR"], contractors: ["Albañilería Hernández", "Instalaciones Eléctricas Rivas"] },
  { name: "Guadalajara 83", code: "GDL-83", projectType: "Departamento", city: "Condesa", etapa: "diseno", progress: 58, start: -75, end: 45, manager: "PL", members: ["PL", "MG"], contractors: ["Estudio de Render"] },
  { name: "Madrid 22", code: "MD-22", projectType: "Casa", city: "Juárez", etapa: "construccion", progress: 91, start: -160, end: 13, manager: "AR", members: ["AR", "LR"], contractors: ["Pisos y Acabados Luna"] },
  { name: "Salim Ortopedia", code: "SAL-01", projectType: "Consultorio", city: "Polanco", etapa: "presale", progress: 24, start: -30, end: 90, manager: "AR", members: ["AR"], contractors: [] },
  { name: "Casa Lomas", code: "LOM-01", projectType: "Residencia", city: "Lomas", etapa: "construccion", progress: 40, start: -90, end: 120, manager: "PL", members: ["PL", "LR", "MG"], contractors: ["Albañilería Hernández", "Hidráulica Torres"] },
  { name: "Oficinas Roma", code: "ROM-01", projectType: "Oficinas", city: "Roma Norte", etapa: "presale", progress: 12, start: -14, end: 150, manager: "AR", members: ["AR", "MG", "SC"], contractors: ["Cancelería Moderna"] },
  { name: "Workspace", code: "WS-00", projectType: "Interno", city: "Cincel", etapa: "presale", progress: 0, start: -60, end: 60, manager: "AR", members: ["AR"], contractors: [], status: "pausado" },
];

async function workflowIds(): Promise<Map<EtapaKey, string>> {
  const rows = await db
    .select({ id: schema.workflows.id, key: schema.workflows.key })
    .from(schema.workflows)
    .where(isNull(schema.workflows.deletedAt));
  const ids = new Map<EtapaKey, string>();
  for (const r of rows) {
    if (r.key === "presale" || r.key === "diseno" || r.key === "construccion") ids.set(r.key, r.id);
  }
  for (const key of ["presale", "diseno", "construccion"] as const) {
    if (!ids.has(key)) throw new Error(`Workflow "${key}" is missing. Run npm run db:seed first.`);
  }
  return ids;
}

async function seedProjects(
  people: Map<PersonKey, string>,
  workflows: Map<EtapaKey, string>,
  clients: Map<string, string>,
  providers: Map<string, string>,
  ownerId: string
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const p of PROJECTS) {
    const workflowId = workflows.get(p.etapa)!;
    const values = {
      code: p.code,
      name: p.name,
      clientId: clients.get(p.name) ?? null,
      status: p.status ?? ("activo" as const),
      currentWorkflowId: workflowId,
      projectType: p.projectType,
      addressCity: p.city,
      managerId: people.get(p.manager)!,
      progress: p.progress,
      startDate: day(p.start),
      endDate: day(p.end),
    };
    const existing = await db.query.projects.findFirst({
      // Same scope as projects_name_lower_uq: live active/paused projects.
      where: sql`lower(${schema.projects.name}) = lower(${p.name}) and ${schema.projects.deletedAt} is null and ${schema.projects.status} in ('activo', 'pausado')`,
    });
    let id: string;
    if (existing) {
      // Keep an existing code (it is unique firm-wide).
      await db
        .update(schema.projects)
        .set({ ...values, code: existing.code })
        .where(eq(schema.projects.id, existing.id));
      id = existing.id;
    } else {
      const codeTaken = await db.query.projects.findFirst({
        where: sql`${schema.projects.code} = ${p.code} and ${schema.projects.deletedAt} is null`,
      });
      const [row] = await db
        .insert(schema.projects)
        .values({ ...values, code: codeTaken ? null : p.code })
        .returning({ id: schema.projects.id });
      id = row.id;
    }
    ids.set(p.name, id);

    await db
      .insert(schema.projectStages)
      .values({ projectId: id, workflowId, startedAt: at(p.start, "09:00"), startedById: ownerId })
      .onConflictDoNothing();

    for (const key of p.members) {
      await db
        .insert(schema.projectMembers)
        .values({ projectId: id, staffId: people.get(key)!, role: key === p.manager ? "Responsable" : null })
        .onConflictDoNothing();
    }
    for (const name of p.contractors) {
      await db
        .insert(schema.projectContacts)
        .values({ projectId: id, contactId: providers.get(name)!, role: "Contratista" })
        .onConflictDoNothing();
    }
  }
  console.log(`  projects: ${ids.size} ready`);
  return ids;
}

// ── Tasks ───────────────────────────────────────────────────────────────────

type TaskSeed = {
  title: string;
  project: string;
  /** null = General (no etapa). */
  etapa: EtapaKey | null;
  manager: PersonKey | null;
  support?: PersonKey[];
  status: "pendiente" | "en_proceso" | "completado" | "bloqueado";
  priority: "alta" | "media" | "baja";
  /** Commitment date, days from today. Open + negative = Vencida. */
  due: number;
  review?: number;
  /** [done, total] subtasks. */
  checklist?: [number, number];
  /** Completed: closed this many days ago. */
  closed?: number;
};

const TASKS: ReadonlyArray<TaskSeed> = [
  // ── Pendiente ──
  { title: "No muestra los errores al llenar la tarea", project: "Workspace", etapa: null, manager: "AR", status: "pendiente", priority: "media", due: 0 },
  { title: "No sirve el botón de Área en tablas", project: "Workspace", etapa: null, manager: "AR", status: "pendiente", priority: "media", due: 2, checklist: [0, 1] },
  { title: "Carpeta de proyecto terminado", project: "Local Espinopapa", etapa: "construccion", manager: null, status: "pendiente", priority: "alta", due: -35 },
  { title: "Plano de acabados", project: "Salim Ortopedia", etapa: "presale", manager: "AR", support: ["PL"], status: "pendiente", priority: "alta", due: -2, review: 0, checklist: [2, 5] },
  { title: "Organizar carpetas y tiempos de entrega", project: "Guadalajara 83", etapa: "diseno", manager: "PL", status: "pendiente", priority: "media", due: -23, checklist: [1, 4] },
  { title: "Cotización de cancelería", project: "Oficinas Roma", etapa: "presale", manager: "SC", status: "pendiente", priority: "baja", due: 11, checklist: [0, 2] },
  { title: "Firma de contrato", project: "Salim Ortopedia", etapa: "presale", manager: "AR", status: "pendiente", priority: "alta", due: 18 },
  { title: "Propuesta Roma", project: "Oficinas Roma", etapa: "presale", manager: "SC", support: ["AR"], status: "pendiente", priority: "media", due: -3 },
  { title: "Levantamiento del sitio", project: "Oficinas Roma", etapa: "presale", manager: "MG", status: "pendiente", priority: "media", due: 4 },
  { title: "Instalación hidráulica", project: "Casa Lomas", etapa: "construccion", manager: "PL", status: "pendiente", priority: "alta", due: -11 },
  { title: "Revisar acabados", project: "Local Espinopapa", etapa: "construccion", manager: "PL", status: "pendiente", priority: "media", due: -10 },
  { title: "Ajuste de planos", project: "Guadalajara 83", etapa: "diseno", manager: "MG", status: "pendiente", priority: "media", due: -10 },
  { title: "Presentación cliente", project: "Guadalajara 83", etapa: "diseno", manager: "MG", support: ["PL"], status: "pendiente", priority: "alta", due: -7 },
  { title: "Montar escaparate", project: "Local Espinopapa", etapa: "construccion", manager: "LR", status: "pendiente", priority: "media", due: -4 },
  { title: "Anexo 05", project: "Madrid 22", etapa: "construccion", manager: "AR", status: "pendiente", priority: "baja", due: -3 },
  { title: "Compra de mobiliario", project: "Madrid 22", etapa: "construccion", manager: "LR", status: "pendiente", priority: "media", due: 7 },
  { title: "Visita de obra", project: "Casa Lomas", etapa: "construccion", manager: "PL", status: "pendiente", priority: "media", due: 4 },
  { title: "Falta pasillo en planta baja", project: "Casa Lomas", etapa: "construccion", manager: "MG", status: "pendiente", priority: "media", due: -1 },
  { title: "Programa arquitectónico", project: "Salim Ortopedia", etapa: "presale", manager: "SC", status: "pendiente", priority: "media", due: 9 },
  // ── En proceso ──
  { title: "Cambiar tapas a WC por unas con rosca metálica", project: "Local Espinopapa", etapa: "construccion", manager: "PL", status: "en_proceso", priority: "media", due: -38, checklist: [1, 3] },
  { title: "Producción de renders", project: "Guadalajara 83", etapa: "diseno", manager: "PL", support: ["MG"], status: "en_proceso", priority: "media", due: 6, review: 0, checklist: [3, 4] },
  { title: "Cierre de trabajos", project: "Madrid 22", etapa: "construccion", manager: "LR", support: ["AR"], status: "en_proceso", priority: "alta", due: 13, review: 0, checklist: [4, 6] },
  { title: "Colado de losa", project: "Casa Lomas", etapa: "construccion", manager: "PL", status: "en_proceso", priority: "alta", due: 11, checklist: [0, 3] },
  { title: "Reunión de arranque", project: "Oficinas Roma", etapa: "presale", manager: "AR", status: "en_proceso", priority: "media", due: -4 },
  { title: "Revisión de obra", project: "Local Espinopapa", etapa: "construccion", manager: "PL", support: ["AR"], status: "en_proceso", priority: "alta", due: -2 },
  { title: "Actualizar renders", project: "Guadalajara 83", etapa: "diseno", manager: "MG", status: "en_proceso", priority: "media", due: -1 },
  { title: "Entrega de renders", project: "Guadalajara 83", etapa: "diseno", manager: "MG", status: "en_proceso", priority: "alta", due: 6 },
  { title: "Instalación eléctrica", project: "Local Espinopapa", etapa: "construccion", manager: "PL", status: "en_proceso", priority: "media", due: -14 },
  { title: "Selección de pisos", project: "Madrid 22", etapa: "construccion", manager: "LR", status: "en_proceso", priority: "media", due: -6 },
  { title: "Cimentación", project: "Casa Lomas", etapa: "construccion", manager: "PL", status: "en_proceso", priority: "alta", due: -8 },
  // ── Completado (Ritmo semanal, Completadas) ──
  { title: "Levantamiento fotográfico", project: "Local Espinopapa", etapa: "construccion", manager: "PL", status: "completado", priority: "media", due: -30, closed: 28 },
  { title: "Anteproyecto", project: "Guadalajara 83", etapa: "diseno", manager: "MG", status: "completado", priority: "alta", due: -21, closed: 20 },
  { title: "Demolición", project: "Madrid 22", etapa: "construccion", manager: "LR", status: "completado", priority: "media", due: -15, closed: 13 },
  { title: "Brief del cliente", project: "Salim Ortopedia", etapa: "presale", manager: "AR", status: "completado", priority: "media", due: -9, closed: 8 },
  { title: "Trazo y nivelación", project: "Casa Lomas", etapa: "construccion", manager: "PL", status: "completado", priority: "alta", due: -5, closed: 4 },
  { title: "Contrato de diseño", project: "Oficinas Roma", etapa: "presale", manager: "SC", status: "completado", priority: "media", due: -2, closed: 1 },
];

const CHECKLIST_TITLES = [
  "Revisar medidas",
  "Validar con el cliente",
  "Actualizar planos",
  "Subir a Drive",
  "Confirmar con proveedor",
  "Registrar en bitácora",
];

async function seedTasks(
  people: Map<PersonKey, string>,
  workflows: Map<EtapaKey, string>,
  projects: Map<string, string>,
  ownerId: string
): Promise<Map<string, string>> {
  // Replace the demo tasks of each demo project (matched by title), keep the rest.
  const titlesByProject = new Map<string, string[]>();
  for (const t of TASKS) titlesByProject.set(t.project, [...(titlesByProject.get(t.project) ?? []), t.title]);
  for (const [project, titles] of titlesByProject) {
    const old = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projects.get(project)!),
          inArray(schema.tasks.title, titles),
          eq(schema.tasks.kind, "usuario")
        )
      );
    const oldIds = old.map((r) => r.id);
    if (oldIds.length === 0) continue;
    // Their subtasks first (the FK would only null their parent).
    await db.delete(schema.tasks).where(inArray(schema.tasks.parentTaskId, oldIds));
    await db.delete(schema.tasks).where(inArray(schema.tasks.id, oldIds));
  }

  const ids = new Map<string, string>();
  for (const [i, t] of TASKS.entries()) {
    const closed = t.status === "completado";
    const [row] = await db
      .insert(schema.tasks)
      .values({
        projectId: projects.get(t.project)!,
        kind: "usuario",
        workflowId: t.etapa ? workflows.get(t.etapa)! : null,
        title: t.title,
        createdById: ownerId,
        managerId: t.manager ? people.get(t.manager)! : null,
        status: t.status,
        priority: t.priority,
        commitmentDate: day(t.due),
        reviewDate: t.review === undefined ? null : day(t.review),
        deliveryDate: day(t.due),
        closedAt: closed ? at(-(t.closed ?? 0), "17:00") : null,
        sortOrder: i,
        // Spread creation over the last 8 weeks so Ritmo semanal has a curve.
        createdAt: at(-(7 + ((i * 5) % 50)), "10:00"),
      })
      .returning({ id: schema.tasks.id });
    ids.set(`${t.project}::${t.title}`, row.id);

    for (const key of t.support ?? []) {
      await db.insert(schema.taskSupport).values({ taskId: row.id, staffId: people.get(key)! }).onConflictDoNothing();
    }
    if (t.checklist) {
      const [done, total] = t.checklist;
      await db.insert(schema.tasks).values(
        Array.from({ length: total }, (_, n) => ({
          projectId: projects.get(t.project)!,
          parentTaskId: row.id,
          kind: "usuario" as const,
          workflowId: t.etapa ? workflows.get(t.etapa)! : null,
          title: CHECKLIST_TITLES[n % CHECKLIST_TITLES.length],
          createdById: ownerId,
          status: n < done ? ("completado" as const) : ("pendiente" as const),
          closedAt: n < done ? at(-1, "12:00") : null,
          sortOrder: n + 1,
        }))
      );
    }
  }
  const open = TASKS.filter((t) => t.status !== "completado");
  const overdue = open.filter((t) => t.due < 0).length;
  console.log(
    `  tasks: ${TASKS.length} (${open.filter((t) => t.status === "pendiente").length} pendiente, ` +
      `${open.filter((t) => t.status === "en_proceso").length} en proceso, ${overdue} vencidas, ` +
      `${TASKS.length - open.length} completadas)`
  );
  return ids;
}

// ── Mi espacio (owner only) ─────────────────────────────────────────────────

const NOTES: ReadonlyArray<{ title: string; body: string; color: "neutral" | "blue" | "amber" | "violet" | "cyan"; pinned?: boolean; project?: string; age: number }> = [
  { title: "Ideas recepción Local Espinopapa", body: "- Mostrador en encino natural\n- Iluminación cálida indirecta\n- Logo en latón", color: "amber", pinned: true, project: "Local Espinopapa", age: 0 },
  { title: "Pendientes con el cliente", body: "- Definir presupuesto de mobiliario\n- Confirmar horario de obra", color: "blue", project: "Casa Lomas", age: 1 },
  { title: "Proveedores a contactar", body: "- Cancelería de aluminio\n- Piedra para baños\n- Carpintero para closets", color: "neutral", age: 3 },
  { title: "Medidas cocina Guadalajara 83", body: "- Muro fondo 3.42 m\n- Ventana 1.20 × 1.10 m\n- Altura libre 2.60 m", color: "cyan", project: "Guadalajara 83", age: 7 },
  { title: "Cursos del mes", body: "- Taller de renders\n- Normativa CDMX 2026", color: "violet", age: 14 },
];

const CHECKLISTS: ReadonlyArray<{ title: string; project: string; items: Array<[string, boolean]> }> = [
  {
    title: "Visita de obra · Casa Lomas",
    project: "Casa Lomas",
    items: [
      ["Llevar planos impresos", true],
      ["Medir vanos de cancelería", true],
      ["Fotos de instalaciones", false],
      ["Firmar bitácora", false],
    ],
  },
  {
    title: "Arranque de proyecto · Oficinas Roma",
    project: "Oficinas Roma",
    items: [
      ["Contrato firmado", true],
      ["Levantamiento del sitio", false],
      ["Crear grupo en Drive", false],
    ],
  },
];

const REMINDERS: ReadonlyArray<{ text: string; offset: number; time: string; project?: string; task?: string }> = [
  { text: "Llamar a María por cotas", offset: 0, time: "11:00", project: "Guadalajara 83" },
  { text: "Enviar factura de anticipo", offset: 0, time: "13:30", project: "Oficinas Roma" },
  { text: "Visita de obra", offset: 1, time: "09:00", project: "Casa Lomas", task: "Casa Lomas::Visita de obra" },
  { text: "Revisar renders con María", offset: 1, time: "16:00", project: "Guadalajara 83", task: "Guadalajara 83::Producción de renders" },
];

async function seedMySpace(ownerId: string, projects: Map<string, string>, tasks: Map<string, string>) {
  await db
    .delete(schema.notes)
    .where(and(eq(schema.notes.staffId, ownerId), inArray(schema.notes.title, NOTES.map((n) => n.title))));
  for (const n of NOTES) {
    await db.insert(schema.notes).values({
      staffId: ownerId,
      title: n.title,
      body: n.body,
      color: n.color,
      pinned: n.pinned ?? false,
      projectId: n.project ? projects.get(n.project)! : null,
      createdAt: at(-n.age, "09:00"),
      updatedAt: at(-n.age, "09:00"),
    });
  }

  await db
    .delete(schema.checklists)
    .where(and(eq(schema.checklists.staffId, ownerId), inArray(schema.checklists.title, CHECKLISTS.map((c) => c.title))));
  for (const c of CHECKLISTS) {
    const [row] = await db
      .insert(schema.checklists)
      .values({ staffId: ownerId, title: c.title, projectId: projects.get(c.project)! })
      .returning({ id: schema.checklists.id });
    await db
      .insert(schema.checklistItems)
      .values(c.items.map(([text, done], i) => ({ checklistId: row.id, text, done, sortOrder: i })));
  }

  await db
    .delete(schema.reminders)
    .where(and(eq(schema.reminders.staffId, ownerId), inArray(schema.reminders.text, REMINDERS.map((r) => r.text))));
  for (const r of REMINDERS) {
    await db.insert(schema.reminders).values({
      staffId: ownerId,
      text: r.text,
      dueAt: at(r.offset, r.time),
      repeat: "none",
      channels: ["app"],
      projectId: r.project ? projects.get(r.project)! : null,
      taskId: r.task ? (tasks.get(r.task) ?? null) : null,
    });
  }
  console.log(`  mi espacio: ${NOTES.length} notes, ${CHECKLISTS.length} checklists, ${REMINDERS.length} reminders`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Demo seed on ${connectionString.replace(/:[^:@/]*@/, ":***@")} (today ${TODAY}, ${TIME_ZONE})`);
  const workflows = await workflowIds();
  const people = await seedPeople();
  const owner = (await findLiveStaffByEmail(OWNER_EMAIL)) ?? null;
  const ownerId = owner?.id ?? people.get("AR")!;
  if (!owner) console.log(`  owner: no staff with email ${OWNER_EMAIL}; Mi espacio goes to Alejandro Riofrio`);
  const { clients, providers } = await seedContacts();
  const projects = await seedProjects(people, workflows, clients, providers, ownerId);
  const tasks = await seedTasks(people, workflows, projects, ownerId);
  await seedMySpace(ownerId, projects, tasks);
  console.log("Demo seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
