/**
 * Production-sized synthetic data for the workspace search timing
 * (`scripts/measure-search.ts`, docs/perf/search-timing.md, issue #912).
 *
 * Fills a throwaway database with realistic Spanish names and titles for
 * every table search reads: staff, contacts, projects, tasks, drive files
 * linked from projects, and notes. Never point it at the live database or a
 * shared one: it only inserts, but the rows are fake.
 *
 * Run after the schema and `scripts/seed.ts` (workflows, admin):
 *   DATABASE_URL=postgres://… npx tsx scripts/perf/seed-search-volume.ts
 *
 * Volumes (override with env): SV_STAFF=40 SV_CONTACTS=1500 SV_PROJECTS=500
 * SV_TASKS_PER_PROJECT=80 SV_FILES=20000 SV_LINKS_PER_FILE=1.2 SV_NOTES=8000.
 * The defaults are several times the largest real dataset, so the numbers
 * are an upper bound.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const sql = postgres(url, { max: 1, onnotice: () => {} });

type Row = Record<string, string | number | boolean | Date | null>;

const n = (key: string, fallback: number) => Number(process.env[key] ?? fallback);
const STAFF = n("SV_STAFF", 40);
const CONTACTS = n("SV_CONTACTS", 1500);
const PROJECTS = n("SV_PROJECTS", 500);
const TASKS_PER_PROJECT = n("SV_TASKS_PER_PROJECT", 80);
const FILES = n("SV_FILES", 20000);
const LINKS_PER_FILE = n("SV_LINKS_PER_FILE", 1.2);
const NOTES = n("SV_NOTES", 8000);

// Deterministic generator so two runs produce the same dataset.
let seed = 912;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];

const FIRST = ["Ana", "Luis", "María", "José", "Sofía", "Carlos", "Lucía", "Diego", "Valeria", "Jorge", "Mariana", "Andrés", "Fernanda", "Ricardo", "Daniela", "Alejandro", "Paula", "Miguel", "Camila", "Héctor", "Renata", "Óscar", "Ximena", "Raúl", "Ángela"];
const LAST = ["López", "García", "Hernández", "Martínez", "González", "Pérez", "Rodríguez", "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Gutiérrez", "Ortiz", "Chávez", "Ruiz", "Mendoza", "Aguilar", "Castillo", "Vargas", "Núñez"];
const COMPANY = ["Constructora", "Inmobiliaria", "Grupo", "Desarrollos", "Materiales", "Aceros", "Carpintería", "Vidrios", "Instalaciones", "Acabados", "Herrería", "Iluminación", "Cancelería", "Mármoles"];
const PLACE = ["del Valle", "Polanco", "Roma", "Condesa", "Coyoacán", "San Ángel", "Santa Fe", "Tlalpan", "Narvarte", "Juárez", "Escandón", "Pedregal", "Lomas", "Satélite", "Interlomas", "Querétaro", "Valle de Bravo", "Tepoztlán", "Puebla", "Mérida"];
const PROJECT_KIND = ["Casa", "Departamento", "Oficinas", "Local", "Remodelación casa", "Restaurante", "Torre", "Bodega", "Casa de campo", "Penthouse", "Clínica", "Cafetería"];
const TASK_VERB = ["Revisar", "Enviar", "Actualizar", "Dibujar", "Cotizar", "Aprobar", "Entregar", "Corregir", "Coordinar", "Visitar", "Solicitar", "Presentar", "Medir", "Validar"];
const TASK_OBJECT = ["plano arquitectónico", "plano estructural", "plano de instalaciones", "diseño de cocina", "diseño de baño", "render de fachada", "presupuesto de obra", "catálogo de conceptos", "memoria descriptiva", "licencia de construcción", "avance de obra", "detalles de cancelería", "propuesta de acabados", "planta de conjunto", "corte por fachada", "levantamiento", "cronograma", "minuta con cliente", "muestras de piso", "iluminación"];
const FILE_STEM = ["Plano", "Planta", "Corte", "Fachada", "Render", "Presupuesto", "Contrato", "Minuta", "Memoria", "Catálogo", "Levantamiento", "Diseño", "Cotización", "Bitácora de obra", "Detalle"];
const FILE_EXT = ["pdf", "dwg", "jpg", "png", "xlsx", "docx", "skp"];
const NOTE_LINE = ["Llamar al cliente para revisar el plano", "Pendiente confirmar diseño de cocina", "Ideas para la fachada de la casa", "Revisar presupuesto de obra con Ana", "Visita de obra el jueves", "Material para el baño principal", "Comentarios del cliente sobre el render", "Proveedores de cancelería", "Lista de pendientes de la semana", "Acuerdos de la junta de diseño"];

async function insertChunked(table: string, rows: Row[], columns: string[], chunk = 1000) {
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const out = await sql`insert into ${sql(`core.${table}`)} ${sql(rows.slice(i, i + chunk), columns)} returning id`;
    ids.push(...out.map((r) => r.id as string));
  }
  return ids;
}

async function main() {
  console.log(`Seeding search volume into ${url!.replace(/:[^:@/]*@/, ":***@")}`);
  const workflows = (await sql`select id from core.workflows where deleted_at is null`).map((r) => r.id as string);

  // Staff
  const usedStaff = new Set((await sql`select lower(name) as n from core.staff`).map((r) => r.n as string));
  const staffRows: Row[] = [];
  while (staffRows.length < STAFF) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (usedStaff.has(name.toLowerCase())) continue;
    usedStaff.add(name.toLowerCase());
    const i = staffRows.length;
    staffRows.push({ name, last_name: pick(LAST), email: `persona${i + 1}@ejemplo.mx`, role: pick(["Arquitecto", "Diseñadora", "Residente de obra", "Coordinador", "Dibujante"]) });
  }
  await insertChunked("staff", staffRows, ["name", "last_name", "email", "role"]);
  const staffIds = (await sql`select id from core.staff where deleted_at is null and active`).map((r) => r.id as string);

  // Contacts (clients, providers, partners)
  const usedContacts = new Set<string>();
  const contactRows: Row[] = [];
  while (contactRows.length < CONTACTS) {
    const type = rand() < 0.55 ? "cliente" : rand() < 0.8 ? "proveedor" : "socio";
    const base = type === "cliente" && rand() < 0.6 ? `${pick(FIRST)} ${pick(LAST)} ${pick(LAST)}` : `${pick(COMPANY)} ${pick(LAST)} ${pick(PLACE)}`;
    let name = base;
    for (let k = 2; usedContacts.has(`${type}:${name.toLowerCase()}`); k++) name = `${base} ${k}`;
    usedContacts.add(`${type}:${name.toLowerCase()}`);
    contactRows.push({ type, name });
  }
  await insertChunked("contacts", contactRows, ["type", "name"]);
  const clientIds = (await sql`select id from core.contacts where type = 'cliente'`).map((r) => r.id as string);

  // Projects (names unique among live projects)
  const projectRows: Row[] = [];
  const usedProjects = new Set<string>();
  for (let i = 0; i < PROJECTS; i++) {
    const base = `${pick(PROJECT_KIND)} ${pick(LAST)} ${pick(PLACE)}`;
    let name = base;
    for (let k = 2; usedProjects.has(name.toLowerCase()); k++) name = `${base} ${k}`;
    usedProjects.add(name.toLowerCase());
    projectRows.push({
      name,
      code: `P-${String(2019 + Math.floor(i / 80))}-${String(i + 1).padStart(4, "0")}`,
      client_id: pick(clientIds),
      status: pick(["activo", "activo", "pausado", "completado", "completado", "cancelado"]),
      current_workflow_id: workflows.length && rand() < 0.85 ? pick(workflows) : null,
      progress: int(0, 100),
    });
  }
  const projectIds = await insertChunked("projects", projectRows, ["name", "code", "client_id", "status", "current_workflow_id", "progress"]);

  // Tasks
  const taskRows: Row[] = [];
  for (const projectId of projectIds) {
    for (let i = 0; i < TASKS_PER_PROJECT; i++) {
      const admin = rand() < 0.05;
      taskRows.push({
        project_id: projectId,
        kind: admin ? "admin" : "usuario",
        workflow_id: !admin && workflows.length && rand() < 0.8 ? pick(workflows) : null,
        title: `${pick(TASK_VERB)} ${pick(TASK_OBJECT)}${rand() < 0.3 ? ` ${pick(PLACE)}` : ""}`,
        created_by_id: pick(staffIds),
        manager_id: rand() < 0.85 ? pick(staffIds) : null,
        status: pick(["pendiente", "en_proceso", "completado", "completado", "bloqueado"]),
        archived: rand() < 0.08,
        deleted_at: rand() < 0.03 ? new Date() : null,
      });
    }
  }
  await insertChunked("tasks", taskRows, ["project_id", "kind", "workflow_id", "title", "created_by_id", "manager_id", "status", "archived", "deleted_at"]);

  // Drive files and the project links pointing at them
  const fileRows: Row[] = [];
  for (let i = 0; i < FILES; i++) {
    const name = `${pick(FILE_STEM)} ${pick(TASK_OBJECT)} ${pick(LAST)} v${int(1, 9)}.${pick(FILE_EXT)}`;
    fileRows.push({ google_file_id: `perf-${i + 1}`, file_name: name, web_view_link: `https://drive.google.com/file/d/perf-${i + 1}/view` });
  }
  const fileIds = await insertChunked("drive_files", fileRows, ["google_file_id", "file_name", "web_view_link"]);
  const linkRows: Row[] = [];
  for (let i = 0; i < fileIds.length * LINKS_PER_FILE; i++) {
    const fileId = i < fileIds.length ? fileIds[i] : pick(fileIds);
    linkRows.push({ project_id: pick(projectIds), kind: rand() < 0.8 ? "interno" : "cliente", title: "Archivo", url: `https://drive.google.com/file/d/${fileId}/view`, drive_file_id: fileId });
  }
  await insertChunked("project_links", linkRows, ["project_id", "kind", "title", "url", "drive_file_id"]);

  // Notes
  const noteRows: Row[] = [];
  for (let i = 0; i < NOTES; i++) {
    const body = Array.from({ length: int(1, 6) }, () => pick(NOTE_LINE)).join("\n");
    noteRows.push({ staff_id: staffIds[i % staffIds.length], title: rand() < 0.7 ? pick(NOTE_LINE) : "", body, project_id: rand() < 0.4 ? pick(projectIds) : null });
  }
  await insertChunked("notes", noteRows, ["staff_id", "title", "body", "project_id"]);

  await sql`analyze`;
  const counts = await sql`
    select 'staff' as t, count(*)::int as n from core.staff union all
    select 'contacts', count(*)::int from core.contacts union all
    select 'projects', count(*)::int from core.projects union all
    select 'tasks', count(*)::int from core.tasks union all
    select 'drive_files', count(*)::int from core.drive_files union all
    select 'project_links', count(*)::int from core.project_links union all
    select 'notes', count(*)::int from core.notes`;
  for (const r of counts) console.log(`  ${r.t}: ${r.n}`);
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
