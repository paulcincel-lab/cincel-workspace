/**
 * Workspace search (redesign BE §8.9): one query per type in parallel, merged
 * and ranked (exact 3, prefix 2, word-start 1.5, contains 1, + similarity),
 * scoped like the list actions; contacts only with `clients.canViewClients`;
 * owner-only notes; admin data only with `canSeeAdminData`.
 */
import { and, eq, isNotNull, isNull, ne, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import {
  canSeeAdminData,
  resolveActivitiesCapabilities,
  resolveClientsCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db/client";
import { contacts, driveFiles, notes, projectLinks, projects, staff, tasks, workflows } from "@/lib/db/schema";
import type { SearchResult, SearchResultType } from "@/lib/types/redesign";

export const SEARCH_TYPES: readonly SearchResultType[] = ["proyecto", "tarea", "persona", "archivo", "nota"];
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_MIN_QUERY = 2;

/** `searchWorkspaceAction`: 30 calls per minute per staff member (BE §7.3). */
export const searchRateLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** A result with its rank: `score` = match weight + similarity, `recency` = epoch ms of the last update. */
export type RankedResult = SearchResult & { score: number; recency: number };

// ── Query normalisation ─────────────────────────────────────────────────────

// The same folding runs in SQL (`translate(lower(x))`) and in JS (`foldText`).
const ACCENTED = "áàäâãåéèëêíìïîóòöôõúùüûñç";
const PLAIN = "aaaaaaeeeeiiiiooooouuuunc";

/** Lower case, no accents, single spaces. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type SearchTerms = {
  folded: string;
  prefix: string;
  contains: string;
  /** Null when the query has no letters or digits. */
  wordStart: string | null;
};

/** LIKE patterns of a query, folded and escaped. */
export function searchTerms(query: string): SearchTerms {
  const folded = foldText(query);
  const escaped = escapeLike(folded);
  const words = folded.replace(/[^a-z0-9]+/g, " ").trim();
  return {
    folded,
    prefix: `${escaped}%`,
    contains: `%${escaped}%`,
    wordStart: words ? `% ${escapeLike(words)}%` : null,
  };
}

function fold(column: SQLWrapper): SQL<string> {
  return sql<string>`translate(lower(coalesce(${column}, '')), ${ACCENTED}, ${PLAIN})`;
}

/** Match weight of one field: exact 3, prefix 2, word-start 1.5, contains 1, else 0 (BE §8.9). */
function fieldMatch(column: SQLWrapper, q: SearchTerms): SQL {
  const f = fold(column);
  const wordStart = q.wordStart
    ? sql`when (' ' || regexp_replace(${f}, '[^a-z0-9]+', ' ', 'g')) like ${q.wordStart} then 1.5`
    : sql``;
  return sql`(case when ${f} = ${q.folded} then 3 when ${f} like ${q.prefix} then 2 ${wordStart} when ${f} like ${q.contains} then 1 else 0 end)`;
}

/** Best match weight over the fields plus the best trigram similarity (0–1). */
function rankOf(fields: SQLWrapper[], q: SearchTerms) {
  const match = sql`greatest(${sql.join(
    fields.map((f) => fieldMatch(f, q)),
    sql`, `
  )})`;
  const similarity = sql`greatest(${sql.join(
    fields.map((f) => sql`similarity(${fold(f)}, ${q.folded})`),
    sql`, `
  )})`;
  return {
    matches: sql`${match} > 0`,
    score: sql<number>`(${match} + ${similarity})::float8`,
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

const PROJECT_STATUS_LABEL: Record<string, string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

const CONTACT_TYPE_LABEL: Record<string, string> = {
  cliente: "Cliente",
  proveedor: "Proveedor",
  socio: "Socio",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-11-12` → `12 nov 2026`; null without a date. */
export function formatDueDate(value: string | null): string | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function joinSubtitle(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(" · ");
}

/** The note's title, or its first body line when it has none. */
export function noteTitle(title: string, body: string): string {
  const t = title.trim();
  if (t) return t;
  const firstLine = body.trim().split("\n")[0]?.replace(/^#+\s*/, "").trim() ?? "";
  if (!firstLine) return "Nota";
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

// ── Per-type queries ────────────────────────────────────────────────────────

type Viewer = { staffId: string; isAdmin: boolean };

/** Live projects by name and code, like `fetchProjectsAction` (no client data). */
async function searchProjects(q: SearchTerms, limit: number): Promise<RankedResult[]> {
  const rank = rankOf([projects.name, projects.code], q);
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      tramo: workflows.name,
      updatedAt: projects.updatedAt,
      score: rank.score,
    })
    .from(projects)
    .leftJoin(workflows, eq(workflows.id, projects.currentWorkflowId))
    .where(and(isNull(projects.deletedAt), rank.matches))
    .orderBy(sql`${rank.score} desc`, sql`${projects.updatedAt} desc`)
    .limit(limit);
  return rows.map((r) => ({
    type: "proyecto" as const,
    id: r.id,
    title: r.name,
    subtitle: joinSubtitle(r.tramo ?? "Sin tramo", PROJECT_STATUS_LABEL[r.status] ?? r.status),
    url: `/proyectos/${r.id}`,
    score: Number(r.score),
    recency: time(r.updatedAt),
  }));
}

/** Live, unarchived tasks of live projects, like `fetchTasksAction`; admin tasks only for administrators. */
async function searchTasks(q: SearchTerms, limit: number, viewer: Viewer): Promise<RankedResult[]> {
  const rank = rankOf([tasks.title], q);
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      commitmentDate: tasks.commitmentDate,
      projectName: projects.name,
      updatedAt: tasks.updatedAt,
      score: rank.score,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt),
        eq(tasks.archived, false),
        viewer.isAdmin ? undefined : ne(tasks.kind, "admin"),
        rank.matches
      )
    )
    .orderBy(sql`${rank.score} desc`, sql`${tasks.updatedAt} desc`)
    .limit(limit);
  return rows.map((r) => ({
    type: "tarea" as const,
    id: r.id,
    title: r.title,
    subtitle: joinSubtitle(r.projectName, formatDueDate(r.commitmentDate)),
    url: `/tareas/${r.id}`,
    score: Number(r.score),
    recency: time(r.updatedAt),
  }));
}

/** Active staff by name, last name, full name and email. */
async function searchStaff(q: SearchTerms, limit: number): Promise<RankedResult[]> {
  const fullName = sql`(${staff.name} || coalesce(' ' || ${staff.lastName}, ''))`;
  const rank = rankOf([staff.name, staff.lastName, fullName, staff.email], q);
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      lastName: staff.lastName,
      role: staff.role,
      updatedAt: staff.updatedAt,
      score: rank.score,
    })
    .from(staff)
    .where(and(isNull(staff.deletedAt), eq(staff.active, true), rank.matches))
    .orderBy(sql`${rank.score} desc`, sql`${staff.updatedAt} desc`)
    .limit(limit);
  return rows.map((r) => ({
    type: "persona" as const,
    id: r.id,
    title: r.lastName ? `${r.name} ${r.lastName}` : r.name,
    subtitle: r.role?.trim() || "Equipo",
    url: `/personas/equipo/${r.id}`,
    score: Number(r.score),
    recency: time(r.updatedAt),
  }));
}

/** Live contacts by name; client contacts only for administrators (client data is admin-only). */
async function searchContacts(q: SearchTerms, limit: number, viewer: Viewer): Promise<RankedResult[]> {
  const rank = rankOf([contacts.name], q);
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      type: contacts.type,
      updatedAt: contacts.updatedAt,
      score: rank.score,
    })
    .from(contacts)
    .where(
      and(
        isNull(contacts.deletedAt),
        viewer.isAdmin ? undefined : ne(contacts.type, "cliente"),
        rank.matches
      )
    )
    .orderBy(sql`${rank.score} desc`, sql`${contacts.updatedAt} desc`)
    .limit(limit);
  return rows.map((r) => ({
    type: "persona" as const,
    id: r.id,
    title: r.name,
    subtitle: CONTACT_TYPE_LABEL[r.type] ?? r.type,
    url: `/personas/clientes?contacto=${r.id}`,
    score: Number(r.score),
    recency: time(r.updatedAt),
  }));
}

/** Drive files linked from a live project, by file name; url = Drive web view link. */
async function searchFiles(q: SearchTerms, limit: number): Promise<RankedResult[]> {
  const rank = rankOf([driveFiles.fileName], q);
  const rows = await db
    .select({
      id: driveFiles.id,
      fileName: driveFiles.fileName,
      webViewLink: driveFiles.webViewLink,
      linkUrl: projectLinks.url,
      projectName: projects.name,
      updatedAt: driveFiles.updatedAt,
      score: rank.score,
    })
    .from(driveFiles)
    .innerJoin(projectLinks, eq(projectLinks.driveFileId, driveFiles.id))
    .innerJoin(projects, eq(projects.id, projectLinks.projectId))
    .where(and(isNull(projects.deletedAt), isNotNull(driveFiles.fileName), rank.matches))
    .orderBy(sql`${rank.score} desc`, sql`${driveFiles.updatedAt} desc`, sql`${projects.updatedAt} desc`)
    // A file linked from several projects comes back once per link; deduped below.
    .limit(limit * 3);
  const seen = new Set<string>();
  const out: RankedResult[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      type: "archivo",
      id: r.id,
      title: r.fileName ?? "",
      subtitle: r.projectName,
      url: r.webViewLink ?? r.linkUrl,
      score: Number(r.score),
      recency: time(r.updatedAt),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** The caller's own live notes, by title and body (owner-only, BE §3.6). */
async function searchNotes(q: SearchTerms, limit: number, viewer: Viewer): Promise<RankedResult[]> {
  const rank = rankOf([notes.title, notes.body], q);
  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      body: notes.body,
      projectName: projects.name,
      updatedAt: notes.updatedAt,
      score: rank.score,
    })
    .from(notes)
    .leftJoin(projects, and(eq(projects.id, notes.projectId), isNull(projects.deletedAt)))
    .where(and(eq(notes.staffId, viewer.staffId), isNull(notes.deletedAt), rank.matches))
    .orderBy(sql`${rank.score} desc`, sql`${notes.updatedAt} desc`)
    .limit(limit);
  return rows.map((r) => ({
    type: "nota" as const,
    id: r.id,
    title: noteTitle(r.title, r.body),
    subtitle: r.projectName ?? "Nota",
    url: `/mi-espacio/notas/${r.id}`,
    score: Number(r.score),
    recency: time(r.updatedAt),
  }));
}

// ── Merge ───────────────────────────────────────────────────────────────────

function byRank(a: RankedResult, b: RankedResult): number {
  return b.score - a.score || b.recency - a.recency;
}

/**
 * Merges the per-type lists (BE §8.9): ranked by score, ties by recency; at
 * most `limit` results, keeping the best result of every type that has any
 * (as far as `limit` allows).
 */
export function mergeRanked(lists: RankedResult[][], limit: number): RankedResult[] {
  const all = lists.flat().sort(byRank);
  const picked = new Set<RankedResult>();
  const seenTypes = new Set<SearchResultType>();
  for (const r of all) {
    if (picked.size >= limit) break;
    if (seenTypes.has(r.type)) continue;
    seenTypes.add(r.type);
    picked.add(r);
  }
  for (const r of all) {
    if (picked.size >= limit) break;
    picked.add(r);
  }
  return all.filter((r) => picked.has(r));
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Searches every requested type the user may see. Errors: `INVALID` (trimmed
 * query < 2). `limit` is clamped to 1–50 (default 20).
 */
export async function searchWorkspace(
  user: AuthenticatedUser,
  input: { query: string; types?: SearchResultType[]; limit?: number },
): Promise<SearchResult[]> {
  const query = (input.query ?? "").trim();
  if (query.length < SEARCH_MIN_QUERY) throw new Error("INVALID: query");
  const limit = Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(input.limit ?? SEARCH_DEFAULT_LIMIT)));
  const types = new Set<SearchResultType>(input.types && input.types.length > 0 ? input.types : SEARCH_TYPES);

  const viewer: Viewer = { staffId: user.member.id, isAdmin: canSeeAdminData(user) };
  const canViewProjects = resolveProjectsCapabilities(user).canViewProjects;
  const canViewTasks = resolveActivitiesCapabilities(user).canViewActivities;
  const canViewContacts = resolveClientsCapabilities(user).canViewClients;
  const q = searchTerms(query);

  const none = Promise.resolve<RankedResult[]>([]);
  const lists = await Promise.all([
    types.has("proyecto") && canViewProjects ? searchProjects(q, limit) : none,
    types.has("tarea") && canViewTasks ? searchTasks(q, limit, viewer) : none,
    types.has("persona") ? searchStaff(q, limit) : none,
    types.has("persona") && canViewContacts ? searchContacts(q, limit, viewer) : none,
    types.has("archivo") && canViewProjects ? searchFiles(q, limit) : none,
    types.has("nota") ? searchNotes(q, limit, viewer) : none,
  ]);

  return mergeRanked(lists, limit).map(({ type, id, title, subtitle, url }) => ({ type, id, title, subtitle, url }));
}
