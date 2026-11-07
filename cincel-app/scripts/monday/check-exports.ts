/**
 * Pre-flight check of the stored monday exports (backend spec §11.2): for each
 * imported project, finds the import batch it came from, the batch's
 * `export_path`, and the boards its rows were read from, then checks that the
 * folder and every board's files are still on disk. Read only: it never writes
 * to the database or the export folders.
 *
 * Run with (needs DATABASE_URL and the export folders mounted at the paths
 * stored in `import_batches.export_path`):
 *   npx tsx scripts/monday/check-exports.ts --projects "Madrid 22,Guadalajara 83,Local Espiropapa"
 * Prints markdown; exits 1 when a project, folder or board is missing.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { DONE_FILE } from "./export";

export const DEFAULT_PROJECTS = ["Madrid 22", "Guadalajara 83", "Local Espiropapa"];

export interface BoardRef {
  boardId: string;
  boardName: string | null;
}

/** One imported project and where its export should be. */
export interface ProjectSource {
  name: string;
  projectId: string | null;
  batchId: string | null;
  exportPath: string | null;
  boards: BoardRef[];
}

export interface BoardCheck extends BoardRef {
  /** `boards/<id>/board.json` and `items.ndjson` exist. */
  present: boolean;
  /** The export finished this board (`.done` marker). */
  done: boolean;
}

export interface ProjectCheck extends ProjectSource {
  folder: boolean;
  manifest: boolean;
  checks: BoardCheck[];
  ok: boolean;
  problem: string | null;
}

/** Checks one project's export folder on disk. */
export function checkProject(
  source: ProjectSource,
  exists: (path: string) => boolean = existsSync,
): ProjectCheck {
  const base = { ...source, folder: false, manifest: false, checks: [] as BoardCheck[] };
  if (!source.projectId) return { ...base, ok: false, problem: "Proyecto no encontrado" };
  if (!source.batchId || !source.exportPath)
    return { ...base, ok: false, problem: "El proyecto no viene de una importación de monday" };
  const dir = source.exportPath;
  const folder = exists(dir);
  const manifest = folder && exists(join(dir, "manifest.json"));
  const checks = source.boards.map((b) => {
    const boardDir = join(dir, "boards", b.boardId);
    return {
      ...b,
      present: folder && exists(join(boardDir, "board.json")) && exists(join(boardDir, "items.ndjson")),
      done: folder && exists(join(boardDir, DONE_FILE)),
    };
  });
  let problem: string | null = null;
  if (!folder) problem = "Falta la carpeta de la exportación";
  else if (!manifest) problem = "Falta manifest.json";
  else if (checks.length === 0) problem = "No hay tableros de origen en import_refs";
  else if (checks.some((c) => !c.present)) problem = "Faltan tableros";
  else if (checks.some((c) => !c.done)) problem = "Hay tableros sin terminar de exportar";
  return { ...source, folder, manifest, checks, ok: problem === null, problem };
}

const yes = (v: boolean) => (v ? "sí" : "no");
const cell = (v: string | null) => (v ?? "—").replace(/\|/g, "\\|");

/** Markdown summary, one section per project. */
export function formatChecks(checks: ProjectCheck[]): string {
  const out = ["# Exportaciones de monday guardadas (pre-flight §11.2)", ""];
  out.push("| Proyecto | Resultado | Lote | Carpeta | Existe | Tableros |", "|---|---|---|---|---|---|");
  for (const c of checks) {
    const boards = c.checks.length ? `${c.checks.filter((b) => b.present && b.done).length}/${c.checks.length}` : "—";
    out.push(
      `| ${cell(c.name)} | ${c.ok ? "presente" : `FALTA: ${c.problem}`} | ${cell(c.batchId)} | ${cell(c.exportPath)} | ${yes(c.folder)} | ${boards} |`,
    );
  }
  out.push("");
  for (const c of checks) {
    if (c.checks.length === 0) continue;
    out.push(`## ${c.name}`, "", "| Tablero | ID | Archivos | Terminado |", "|---|---|---|---|");
    for (const b of c.checks) out.push(`| ${cell(b.boardName)} | ${b.boardId} | ${yes(b.present)} | ${yes(b.done)} |`);
    out.push("");
  }
  const missing = checks.filter((c) => !c.ok);
  out.push(
    missing.length === 0
      ? "Todas las exportaciones están presentes."
      : `Vuelve a exportar de monday: ${missing.map((c) => c.name).join(", ")}.`,
    "",
  );
  return out.join("\n");
}

type SourceJson = { boardId?: string; boardName?: string } | null;

/**
 * Reads each project's import batch, export path and source boards: the
 * project's own `import_refs` row plus the boards of its imported tasks.
 * The newest live project with that name wins (names compare case-insensitively).
 */
export async function loadSources(sql: postgres.Sql, names: string[]): Promise<ProjectSource[]> {
  const result: ProjectSource[] = [];
  for (const name of names) {
    const [project] = await sql<{ id: string }[]>`
      select id from core.projects
       where lower(name) = lower(${name}) and deleted_at is null
       order by created_at desc limit 1`;
    if (!project) {
      result.push({ name, projectId: null, batchId: null, exportPath: null, boards: [] });
      continue;
    }
    const [ref] = await sql<{ batchId: string; exportPath: string; source: SourceJson }[]>`
      select b.id as "batchId", b.export_path as "exportPath", r.data->'source' as source
        from core.import_refs r join core.import_batches b on b.id = r.batch_id
       where r.source = 'monday' and r.entity = 'project' and r.row_id = ${project.id}
       order by r.created_at desc limit 1`;
    if (!ref) {
      result.push({ name, projectId: project.id, batchId: null, exportPath: null, boards: [] });
      continue;
    }
    const taskSources = await sql<{ source: SourceJson }[]>`
      select distinct r.data->'source' as source
        from core.import_refs r join core.tasks t on t.id = r.row_id
       where r.source = 'monday' and r.entity = 'task' and r.batch_id = ${ref.batchId}
         and t.project_id = ${project.id}`;
    const boards = new Map<string, BoardRef>();
    for (const s of [ref.source, ...taskSources.map((t) => t.source)]) {
      if (s?.boardId && !boards.has(s.boardId)) boards.set(s.boardId, { boardId: s.boardId, boardName: s.boardName ?? null });
    }
    result.push({ name, projectId: project.id, batchId: ref.batchId, exportPath: ref.exportPath, boards: [...boards.values()] });
  }
  return result;
}

export function parseProjects(argv: string[]): string[] {
  const i = argv.indexOf("--projects");
  if (i === -1 || !argv[i + 1]) return DEFAULT_PROJECTS;
  return argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const checks = (await loadSources(sql, parseProjects(process.argv.slice(2)))).map((s) => checkProject(s));
    process.stdout.write(formatChecks(checks));
    if (checks.some((c) => !c.ok)) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
