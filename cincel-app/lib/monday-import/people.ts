/**
 * monday people in Personas (#689): which monday users are not real people (deleted users, bots), how a monday user
 * matches a staff member (email first, then name) and the order Personas lists them in. Pure and client-safe; init
 * (scripts/monday/init.ts) and the wizard share these rules.
 */

/** The parts of a monday user these rules read. */
export interface MondayPersonLike {
  id: string;
  name: string;
  email: string | null;
  kind?: string | null;
  status?: string | null;
}

/** The parts of a staff member a match reads. */
export interface StaffLike {
  id: string;
  name: string;
  email: string | null;
}

/** monday gives a deleted user an address on this domain. */
const DELETED_DOMAIN = "@deleted.user";

const norm = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

/** A user monday deleted: its address is `…@deleted.user` or its status says so. */
export function isDeletedMondayUser(user: MondayPersonLike): boolean {
  return norm(user.email).endsWith(DELETED_DOMAIN) || norm(user.status) === "deleted";
}

/** A bot or the monday AI agent: its kind, or its address' user or domain part, is a bot or an agent. */
export function isMondayBot(user: MondayPersonLike): boolean {
  if (/\b(bot|agent)s?\b/.test(norm(user.kind))) return true;
  const email = norm(user.email);
  if (email && /(^|[^a-z])(bot|agent)s?([^a-z]|$)/.test(email)) return true;
  return /^monday(\.com)?\s+(ai|bot)\b/.test(norm(user.name));
}

/** Deleted users and bots: listed last under "Eliminados en monday" and ignored by default. */
export function isRetiredMondayUser(user: MondayPersonLike): boolean {
  return isDeletedMondayUser(user) || isMondayBot(user);
}

/** The staff member of a monday user: same email (case insensitive), else same name; never for retired users. */
export function matchStaff<T extends StaffLike>(
  user: MondayPersonLike,
  staff: readonly T[],
): { member: T; by: "email" | "name" } | null {
  if (isRetiredMondayUser(user)) return null;
  const email = norm(user.email);
  if (email) {
    const byEmail = staff.find((member) => norm(member.email) === email);
    if (byEmail) return { member: byEmail, by: "email" };
  }
  const name = norm(user.name);
  if (!name) return null;
  const byName = staff.filter((member) => norm(member.name) === name);
  // Two staff with the same name can't be told apart: no suggestion.
  return byName.length === 1 ? { member: byName[0], by: "name" } : null;
}

/** Personas' two lists: real people in export order, then the retired ones. */
export function splitMondayPeople<T extends MondayPersonLike>(users: readonly T[]): { people: T[]; retired: T[] } {
  const people: T[] = [];
  const retired: T[] = [];
  for (const user of users) (isRetiredMondayUser(user) ? retired : people).push(user);
  return { people, retired };
}

/** The DOM id of a person's row in Personas, so the Vista previa can link straight to it. */
export function personRowId(userId: string): string {
  return `persona-${userId}`;
}

// --- Puesto suggestion for "Crear integrante" (project flow BE §10.8) ---------------------------------------------

/** The parts of a translated task the suggestion reads (scripts/monday/translate.ts `PlannedTask`). */
export interface TaskPlacementSource {
  /** The monday item (or subitem) id. */
  externalId: string;
  workflowId: string | null;
  phaseId: string | null;
  managerId: string | null;
  unmatchedPeople: readonly { id: string }[];
}

/** Where one of the person's tasks lands: its etapa and fase (null when unresolved). */
export interface TaskPlacement {
  workflowId: string | null;
  phaseId: string | null;
}

/** monday people of each item and subitem (any people column), by monday item id. */
export function mondayPeopleByItem(items: readonly unknown[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const row = node as { id?: string; column_values?: unknown[] | null; subitems?: unknown[] | null };
    if (row.id) {
      for (const value of row.column_values ?? []) {
        const v = value as { __typename?: string; persons_and_teams?: { id: string; kind?: string | null }[] | null };
        if (v?.__typename !== "PeopleValue") continue;
        for (const p of v.persons_and_teams ?? []) {
          if (p.kind && p.kind !== "person") continue;
          const set = out.get(row.id) ?? new Set<string>();
          set.add(String(p.id));
          out.set(row.id, set);
        }
      }
    }
    for (const child of row.subitems ?? []) visit(child);
  };
  for (const item of items) visit(item);
  return out;
}

/**
 * The placements of the tasks where a monday person is manager or support: they're an unmatched assignee of the
 * task, its manager or support through their staff match, or in the item's people columns.
 */
export function personTaskPlacements(
  tasks: readonly TaskPlacementSource[],
  mondayUserId: string,
  options: {
    /** The person's staff match, when the mapping has one. */
    staffId?: string | null;
    /** `<itemId>:<mondayUserId>` keys of the planned task support rows. */
    supportKeys?: ReadonlySet<string>;
    /** The export's people per item (`mondayPeopleByItem`). */
    peopleByItem?: ReadonlyMap<string, ReadonlySet<string>>;
  } = {},
): TaskPlacement[] {
  const out: TaskPlacement[] = [];
  for (const task of tasks) {
    const theirs =
      task.unmatchedPeople.some((p) => p.id === mondayUserId) ||
      (options.staffId != null && task.managerId === options.staffId) ||
      Boolean(options.supportKeys?.has(`${task.externalId}:${mondayUserId}`)) ||
      Boolean(options.peopleByItem?.get(task.externalId)?.has(mondayUserId));
    if (theirs) out.push({ workflowId: task.workflowId, phaseId: task.phaseId });
  }
  return out;
}

/** The catalog the scoring reads: live, active puestos with candidate fases, and fase and etapa names. */
export interface PositionSuggestionCatalog {
  positions: readonly { id: string; name: string; sortOrder: number; phaseIds: readonly string[] }[];
  phases: Readonly<Record<string, { workflowId: string; name: string; sortOrder?: number }>>;
  workflows: Readonly<Record<string, { name: string; sortOrder?: number }>>;
}

/** What `MondayPositionSuggestion` carries (lib/types/monday-import.ts). */
export interface PositionSuggestion {
  position: { id: string; name: string } | null;
  tasks: number;
  topPhases: { workflowName: string; phaseName: string; tasks: number }[];
}

/**
 * Scores each puesto by the person's tasks in its candidate fases. The suggestion is the highest score (ties: the
 * lower `sortOrder`), or no puesto when no task has a fase or no puesto scores. `topPhases` lists up to three fases
 * by task count (ties: catalog order) with their etapa name.
 */
export function suggestPositionFrom(
  placements: readonly TaskPlacement[],
  catalog: PositionSuggestionCatalog,
): PositionSuggestion {
  const perPhase = new Map<string, number>();
  for (const p of placements) {
    if (p.phaseId && catalog.phases[p.phaseId]) perPhase.set(p.phaseId, (perPhase.get(p.phaseId) ?? 0) + 1);
  }
  const phaseOrder = (id: string) => {
    const phase = catalog.phases[id];
    return [catalog.workflows[phase.workflowId]?.sortOrder ?? 0, phase.sortOrder ?? 0] as const;
  };
  const topPhases = [...perPhase]
    .sort(([a, na], [b, nb]) => {
      if (nb !== na) return nb - na;
      const [wa, pa] = phaseOrder(a);
      const [wb, pb] = phaseOrder(b);
      return wa - wb || pa - pb || a.localeCompare(b);
    })
    .slice(0, 3)
    .map(([id, tasks]) => {
      const phase = catalog.phases[id];
      return { workflowName: catalog.workflows[phase.workflowId]?.name ?? "", phaseName: phase.name, tasks };
    });

  let best: { id: string; name: string; sortOrder: number; score: number } | null = null;
  for (const position of catalog.positions) {
    const score = [...new Set(position.phaseIds)].reduce((sum, id) => sum + (perPhase.get(id) ?? 0), 0);
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && position.sortOrder < best.sortOrder))
      best = { id: position.id, name: position.name, sortOrder: position.sortOrder, score };
  }
  return {
    position: best ? { id: best.id, name: best.name } : null,
    tasks: placements.length,
    topPhases,
  };
}

/**
 * The line under the Puesto select: "Sugerido por sus tareas: 34 de 40 en Diseño · Ejecutivo." with the fase most of
 * the person's tasks land in; without a suggestion, why.
 */
export function positionSuggestionReason(suggestion: PositionSuggestion): string {
  const top = suggestion.topPhases[0];
  if (!top) return "Sin sugerencia: sus tareas no tienen fase.";
  if (!suggestion.position) return "Sin sugerencia: ningún puesto tiene las fases de sus tareas.";
  const where = top.workflowName ? `${top.workflowName} · ${top.phaseName}` : top.phaseName;
  return `Sugerido por sus tareas: ${top.tasks} de ${suggestion.tasks} en ${where}.`;
}
