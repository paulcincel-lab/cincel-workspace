/**
 * Personas · Equipo data shaping (redesign FE §3.6, §4.7). Pure and
 * client-safe: joins the staff DTOs with the `fetchPeopleOverviewAction` rows
 * into the `PersonDatum` shape the people widgets render.
 */
import type { Group } from "@/components/widgets/GroupedTable";
import { tramoColorVar, tramoLabel } from "@/lib/tramos/compat";
import type { PeopleOverviewRow, PersonProjectLoad, PresentationStyle, WeekLoad } from "@/lib/types/redesign";
import type { ContactListItem, Staff, WorkflowRef } from "@/lib/types/core";
import type { Availability, PersonDatum } from "@/lib/types/widgets";

export type PersonasTab = "equipo" | "clientes" | "contratistas" | "proveedores";

export type PeopleShow = ("load" | "hours" | "availability" | "projects")[];

export type AvailabilityRow = { staffId: string; name: string; days: Availability[] };

export type TeamPeople = {
  people: PersonDatum[];
  /** Institutional email per staff id (not part of `PersonDatum`, FE §4.9). */
  emails: Record<string, string | null>;
};

const PRESENTATION_STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** The `?estilo=` override (FE §4.2), or null when absent or unknown. */
export function parseEstiloParam(value: string | string[] | undefined): PresentationStyle | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return PRESENTATION_STYLES.includes(raw as PresentationStyle) ? (raw as PresentationStyle) : null;
}

export function fullName(member: Pick<Staff, "name" | "lastName">): string {
  return [member.name, member.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase("es-MX");
}

/**
 * Puesto from the person's Project Flow positions. `staff.role` is the system
 * access role and is never shown as puesto.
 */
export function puestoOf(member: Pick<Staff, "positions">): string | null {
  const names = (member.positions ?? []).map((p) => p.name.trim()).filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

/** Tramo key of the person's first candidate fase, matched by tramo name; null without one. */
export function tramoOf(member: Pick<Staff, "candidatePhases">, tramos: WorkflowRef[]): string | null {
  const workflowName = member.candidatePhases?.[0]?.workflowName;
  if (!workflowName) return null;
  const match = tramos.find((t) => t.name.trim().toLocaleLowerCase("es-MX") === workflowName.trim().toLocaleLowerCase("es-MX"));
  return match?.key ?? null;
}

/** One `PersonDatum` per active staff member, in the staff order. */
export function buildTeamPeople(staff: Staff[], overview: PeopleOverviewRow[], tramos: WorkflowRef[]): TeamPeople {
  const rowsById = new Map(overview.map((row) => [row.staffId, row]));
  const people: PersonDatum[] = [];
  const emails: Record<string, string | null> = {};
  for (const member of staff) {
    if (!member.active) continue;
    const name = fullName(member) || member.email || "";
    const row = rowsById.get(member.id);
    const person: PersonDatum = {
      id: member.id,
      name,
      initials: initialsOf(name),
      puesto: puestoOf(member),
      tramo: tramoOf(member, tramos),
      open: row?.open ?? 0,
      overdue: row?.overdue ?? 0,
      weekHours: row ? row.weekHours : null,
      href: `/personas/equipo/${member.id}`,
      capacity: member.capacity,
    };
    if (row) {
      person.activeProjects = row.activeProjects;
      person.occupancyPct = row.occupancyPct;
      if (row.availability.length > 0) person.availability = row.availability;
      if (row.weeks) person.weeks = row.weeks;
      if (row.absences) person.absences = row.absences;
      if (row.projects) person.projects = row.projects;
      if (typeof row.sharesProjectWithViewer === "boolean") person.sharesProjectWithViewer = row.sharesProjectWithViewer;
    }
    people.push(person);
    emails[member.id] = member.email?.trim() || null;
  }
  return { people, emails };
}

/**
 * Whether the hours column/metric is shown: only when the server returned
 * hours for at least one row (`canViewTeamHours` or self, B4). A `0` counts as
 * returned; only `null` / missing means the viewer may not see hours.
 */
export function hasServerHours(people: PersonDatum[]): boolean {
  return people.some((p) => typeof p.weekHours === "number");
}

/** `base` plus `"hours"` when the server returned hours. */
export function teamShow(people: PersonDatum[], base: PeopleShow): PeopleShow {
  const show = base.filter((key) => key !== "hours");
  return hasServerHours(people) ? [...show, "hours"] : show;
}

/** "Disponibilidad esta semana" rows: people with a Mon–Fri availability. */
export function availabilityRows(people: PersonDatum[]): AvailabilityRow[] {
  return people
    .filter((p) => (p.availability?.length ?? 0) > 0)
    .map((p) => ({ staffId: p.id, name: p.name, days: p.availability ?? [] }));
}

/**
 * People with `key` on at least one day of the week (the availability legend
 * filter). Without a key, the same array comes back unchanged.
 */
export function peopleWithAvailability(people: PersonDatum[], key: Availability | null): PersonDatum[] {
  if (!key) return people;
  return people.filter((p) => p.availability?.includes(key) ?? false);
}

/** Counts of the four Personas tabs from the staff and directory lists. */
export function countPersonasTabs(staff: Staff[], contacts: ContactListItem[]): Record<PersonasTab, number> {
  let clientes = 0;
  let contratistas = 0;
  let proveedores = 0;
  for (const contact of contacts) {
    if (contact.type === "cliente") clientes += 1;
    if (contact.type === "proveedor") {
      proveedores += 1;
      if (contact.providerProfile?.subtype === "contratista") contratistas += 1;
    }
  }
  return { equipo: staff.filter((s) => s.active).length, clientes, contratistas, proveedores };
}

/** Href of a Personas tab, keeping a `?estilo=` override across tabs. */
export function personasTabHref(tab: PersonasTab, estilo: PresentationStyle | null): string {
  const path = tab === "equipo" ? "/personas" : `/personas/${tab}`;
  return estilo ? `${path}?estilo=${estilo}` : path;
}

// ── Load buckets, status and filters (Estilos Phase 5) ─────────────────────

/** Load bucket of a person: open tasks ÷ weekly capacity (`occupancyPct`). */
export type LoadBucket = "libre" | "ocupado" | "cargado" | "saturado";

export const LOAD_BUCKET_LABEL: Record<LoadBucket, string> = {
  libre: "Libre",
  ocupado: "Ocupado",
  cargado: "Cargado",
  saturado: "Saturado",
};

/**
 * The only place with the load thresholds: < 60 libre · 60–79 ocupado ·
 * 80–100 cargado · > 100 saturado.
 */
export function loadBucket(pct: number): LoadBucket {
  if (pct > 100) return "saturado";
  if (pct >= 80) return "cargado";
  if (pct >= 60) return "ocupado";
  return "libre";
}

export type PersonStatus =
  | { kind: "bucket"; bucket: LoadBucket }
  /** Absent today, until `until` (inclusive). */
  | { kind: "ausente"; until: string }
  /** An absence starts within the next 7 days. */
  | { kind: "sale"; from: string; to: string };

/** Approved absence range (ISO dates, inclusive), when the overview sends them. */
type AbsenceLike = { from: string; to: string };

/** `PersonDatum.absences` when present (Personas Visual adds the field). */
export function absencesOf(p: PersonDatum): AbsenceLike[] | null {
  const list = (p as PersonDatum & { absences?: AbsenceLike[] }).absences;
  return Array.isArray(list) ? list : null;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Absence-based status from `absences` when present, else from this week's
 * Mon–Fri `availability` ("vacaciones" days).
 */
function absenceStatus(p: PersonDatum, today: string): PersonStatus | null {
  const ranges = absencesOf(p);
  if (ranges) {
    const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
    const current = sorted.find((r) => r.from <= today && r.to >= today);
    if (current) return { kind: "ausente", until: current.to };
    const horizon = addDays(today, 7);
    const next = sorted.find((r) => r.from > today && r.from <= horizon);
    return next ? { kind: "sale", from: next.from, to: next.to } : null;
  }
  const days = p.availability ?? [];
  if (days.length === 0) return null;
  const todayIdx = weekdayIndex(today);
  const monday = addDays(today, -todayIdx);
  const runEnd = (start: number) => {
    let end = start;
    while (end + 1 < days.length && days[end + 1] === "vacaciones") end += 1;
    return addDays(monday, end);
  };
  if (todayIdx < days.length && days[todayIdx] === "vacaciones") return { kind: "ausente", until: runEnd(todayIdx) };
  for (let d = todayIdx + 1; d < days.length; d++) {
    if (days[d] === "vacaciones") return { kind: "sale", from: addDays(monday, d), to: runEnd(d) };
  }
  return null;
}

/** Status of a person today: absent, leaving within 7 days, or their load bucket. */
export function personStatus(p: PersonDatum, today: string): PersonStatus {
  return absenceStatus(p, today) ?? { kind: "bucket", bucket: loadBucket(p.occupancyPct ?? 0) };
}

/** Whether the person is absent today. */
export function isAbsentToday(p: PersonDatum, today: string): boolean {
  return personStatus(p, today).kind === "ausente";
}

/**
 * Someone to take a task instead of `from`: same tramo, not absent today,
 * libre or ocupado, lowest `occupancyPct`; a tie goes to the name (es).
 */
export function suggestAssignee(people: PersonDatum[], from: PersonDatum, today: string): PersonDatum | null {
  if (!from.tramo) return null;
  const candidates = people.filter((p) => {
    if (p.id === from.id || p.tramo !== from.tramo) return false;
    const status = personStatus(p, today);
    if (status.kind === "ausente") return false;
    const bucket = loadBucket(p.occupancyPct ?? 0);
    return bucket === "libre" || bucket === "ocupado";
  });
  candidates.sort(
    (a, b) => (a.occupancyPct ?? 0) - (b.occupancyPct ?? 0) || a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
  return candidates[0] ?? null;
}

export type TeamEstado = "libre" | "cargado" | "saturado" | "vacaciones";
export type TeamPill = "todos" | TeamEstado;

export const TEAM_ESTADOS: readonly TeamEstado[] = ["libre", "cargado", "saturado", "vacaciones"];

/** Lowercase, accents stripped, trimmed. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

/** The pill a person counts in (besides "todos"); null for ocupado. Absent or leaving → vacaciones. */
function pillOf(p: PersonDatum, today: string): TeamEstado | null {
  const status = personStatus(p, today);
  if (status.kind !== "bucket") return "vacaciones";
  return status.bucket === "ocupado" ? null : status.bucket;
}

/** Counts of the Esencial pills. Absent people count only in vacaciones. */
export function teamPillCounts(people: PersonDatum[], today: string): Record<TeamPill, number> {
  const counts: Record<TeamPill, number> = { todos: people.length, libre: 0, cargado: 0, saturado: 0, vacaciones: 0 };
  for (const p of people) {
    const pill = pillOf(p, today);
    if (pill) counts[pill] += 1;
  }
  return counts;
}

/** People of one pill (none → all) whose name, puesto or tramo contains `q` (accent- and case-insensitive). */
export function filterTeam(
  people: PersonDatum[],
  { estado, q }: { estado: TeamEstado | null; q: string | null },
  today: string,
): PersonDatum[] {
  const needle = normalizeSearch(q ?? "");
  return people.filter((p) => {
    if (estado && pillOf(p, today) !== estado) return false;
    if (!needle) return true;
    // Tramo keys are the normalized tramo names ("diseno" ↔ "Diseño"), so the key itself is searched.
    const tramo = (p.tramo ?? "").replace(/[-_]+/g, " ");
    const haystack = [p.name, p.puesto ?? "", tramo].map(normalizeSearch).join(" ");
    return haystack.includes(needle);
  });
}

// ── Saturation (Personas Visual) ────────────────────────────────────────────

export type SaturationSummary = {
  /** The most loaded person over 100 % who is not absent today. */
  top: PersonDatum;
  /** People in `cargado` (not absent today), most loaded first, at most 3. */
  nearLimit: PersonDatum[];
  /** `suggestAssignee` for `top`. */
  candidate: PersonDatum | null;
};

/**
 * "Quién está saturado": the person with the highest `occupancyPct` > 100
 * who is not absent today (ties → most overdue, then name), the people near
 * the limit and who could take one of their tasks. Null when nobody is over
 * 100 %.
 */
export function saturationSummary(people: PersonDatum[], today: string): SaturationSummary | null {
  const present = people.filter((p) => !isAbsentToday(p, today));
  const over = present
    .filter((p) => (p.occupancyPct ?? 0) > 100)
    .sort(
      (a, b) =>
        (b.occupancyPct ?? 0) - (a.occupancyPct ?? 0) ||
        b.overdue - a.overdue ||
        a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );
  const top = over[0];
  if (!top) return null;
  const nearLimit = present
    .filter((p) => loadBucket(p.occupancyPct ?? 0) === "cargado")
    .sort(byLoadThenName)
    .slice(0, 3);
  return { top, nearLimit, candidate: suggestAssignee(people, top, today) };
}

// ── Personas · Analítico (people grouped by tramo, 4-week capacity) ────────

/** Analítico `?estado=` filter (the Esencial pills are `TeamEstado`). */
export type TeamAnaliticoEstado = "todas" | "sobrecargadas" | "con-capacidad";
export type TeamAlcance = "todo" | "mi-equipo";

/** Filters of the Analítico table (`?estado=`, `?tramo=`, `?alcance=`, `?q=`). */
export type TeamAnaliticoFilters = {
  estado: TeamAnaliticoEstado;
  /** Tramo key, `"sin-tramo"` for people without one, or null for all. */
  tramo: string | null;
  alcance: TeamAlcance;
  q: string;
};

export const TEAM_ANALITICO_DEFAULT_FILTERS: TeamAnaliticoFilters = { estado: "todas", tramo: null, alcance: "todo", q: "" };

/** Group id (and `?tramo=` value) of the people without tramo. */
export const SIN_TRAMO = "sin-tramo";

export type TeamFilterCounts = {
  estado: Record<TeamAnaliticoEstado, number>;
  /** Per tramo key (and `SIN_TRAMO`), plus `todos`. */
  tramo: Record<string, number>;
  alcance: Record<TeamAlcance, number>;
};

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-MX").trim();
}

/** Today's date (`YYYY-MM-DD`) when the caller gives none: the local calendar day. */
function localToday(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Over capacity: `occupancyPct > 100`. */
export function isOverloaded(person: PersonDatum): boolean {
  return (person.occupancyPct ?? 0) > 100;
}

/** "Con capacidad": libre or ocupado (under 80 %) and not absent today. */
export function hasCapacity(person: PersonDatum, today: string): boolean {
  const bucket = loadBucket(person.occupancyPct ?? 0);
  return (bucket === "libre" || bucket === "ocupado") && !isAbsentToday(person, today);
}

function matchesEstado(person: PersonDatum, estado: TeamAnaliticoEstado, today: string): boolean {
  if (estado === "sobrecargadas") return isOverloaded(person);
  if (estado === "con-capacidad") return hasCapacity(person, today);
  return true;
}

function matchesTramo(person: PersonDatum, tramo: string | null): boolean {
  if (!tramo) return true;
  if (tramo === SIN_TRAMO) return !person.tramo;
  return person.tramo === tramo;
}

function matchesAlcance(person: PersonDatum, alcance: TeamAlcance): boolean {
  return alcance === "todo" || person.sharesProjectWithViewer === true;
}

function matchesQuery(person: PersonDatum, q: string): boolean {
  const needle = normalizeText(q);
  if (!needle) return true;
  return [person.name, person.puesto ?? ""].some((text) => normalizeText(text).includes(needle));
}

/** The people that pass every Analítico filter, in their order. */
export function filterTeamAnalitico(
  people: PersonDatum[],
  filters: TeamAnaliticoFilters,
  today: string = localToday(),
): PersonDatum[] {
  return people.filter(
    (p) =>
      matchesEstado(p, filters.estado, today) &&
      matchesTramo(p, filters.tramo) &&
      matchesAlcance(p, filters.alcance) &&
      matchesQuery(p, filters.q),
  );
}

/**
 * Count of every filter option, from the loaded rows: each group is counted
 * with the other groups (and the search) applied, never its own.
 */
export function teamFilterCounts(people: PersonDatum[], filters: TeamAnaliticoFilters, today: string): TeamFilterCounts {
  const searched = people.filter((p) => matchesQuery(p, filters.q));
  const forEstado = searched.filter((p) => matchesTramo(p, filters.tramo) && matchesAlcance(p, filters.alcance));
  const forTramo = searched.filter((p) => matchesEstado(p, filters.estado, today) && matchesAlcance(p, filters.alcance));
  const forAlcance = searched.filter((p) => matchesEstado(p, filters.estado, today) && matchesTramo(p, filters.tramo));

  const tramo: Record<string, number> = { todos: forTramo.length };
  for (const p of forTramo) {
    const key = p.tramo || SIN_TRAMO;
    tramo[key] = (tramo[key] ?? 0) + 1;
  }
  return {
    estado: {
      todas: forEstado.length,
      sobrecargadas: forEstado.filter(isOverloaded).length,
      "con-capacidad": forEstado.filter((p) => hasCapacity(p, today)).length,
    },
    tramo,
    alcance: { todo: forAlcance.length, "mi-equipo": forAlcance.filter((p) => matchesAlcance(p, "mi-equipo")).length },
  };
}

/** A person row of the Analítico table: the datum with load fields resolved. */
export type PersonRow = PersonDatum & {
  occupancyPct: number;
  weeks: WeekLoad[];
  projects: PersonProjectLoad[];
};

function toPersonRow(person: PersonDatum): PersonRow {
  return { ...person, occupancyPct: person.occupancyPct ?? 0, weeks: person.weeks ?? [], projects: person.projects ?? [] };
}

/** Average of the values rounded to an integer, or null without values. */
export function roundedAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** People order inside a group: `occupancyPct` desc, then name. */
export function byLoadThenName(a: PersonDatum, b: PersonDatum): number {
  return (b.occupancyPct ?? 0) - (a.occupancyPct ?? 0) || a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}

function personasText(n: number): string {
  return `${n} ${n === 1 ? "persona" : "personas"}`;
}

/**
 * One group per tramo that has people (tramo order), then "Sin tramo" last
 * for people without tramo. People are sorted by
 * load desc, then name. Metrics: people, abiertas, vencidas, carga promedio.
 */
export function tramoGroups(people: PersonDatum[], tramos: WorkflowRef[]): Group<PersonRow>[] {
  const ordered = [...tramos].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
  const known = new Set(ordered.map((t) => t.key));
  const unknown: string[] = [];
  const buckets = new Map<string, PersonDatum[]>();
  for (const p of people) {
    const key = p.tramo || SIN_TRAMO;
    if (key !== SIN_TRAMO && !known.has(key) && !unknown.includes(key)) unknown.push(key);
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }
  // A tramo key outside the list (e.g. while it loads) keeps its own group, after the known ones.
  const entries: Array<{ id: string; label: string; color?: string }> = [
    ...ordered.map((t) => ({ id: t.key, label: t.name, color: tramoColorVar(t.key, t.sortOrder) })),
    ...unknown.map((key) => ({ id: key, label: tramoLabel(key), color: tramoColorVar(key) })),
    { id: SIN_TRAMO, label: "Sin etapa" },
  ];
  const groups: Group<PersonRow>[] = [];
  for (const entry of entries) {
    const list = buckets.get(entry.id);
    if (!list || list.length === 0) continue;
    const rows = [...list].sort(byLoadThenName).map(toPersonRow);
    const open = rows.reduce((n, r) => n + r.open, 0);
    const overdue = rows.reduce((n, r) => n + r.overdue, 0);
    const avg = roundedAverage(rows.map((r) => r.occupancyPct)) ?? 0;
    groups.push({
      id: entry.id,
      label: entry.label,
      ...(entry.color ? { color: entry.color } : {}),
      caption: personasText(rows.length),
      metrics: [
        { key: "abiertas", label: "abiertas", value: String(open) },
        { key: "vencidas", label: "vencidas", value: String(overdue), tone: overdue > 0 ? "destructive" : "default" },
        { key: "carga", label: "carga", value: `${avg} %`, tone: bucketTone(loadBucket(avg)) },
      ],
      rows,
    });
  }
  return groups;
}

/** Metric tone of a load bucket: cargado → warning, saturado → destructive. */
export function bucketTone(bucket: LoadBucket): "default" | "warning" | "destructive" {
  if (bucket === "saturado") return "destructive";
  if (bucket === "cargado") return "warning";
  return "default";
}

// Dates ("9–15 nov", "30 nov–6 dic", "vie 20 nov").

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

function isoParts(iso: string): { y: number; m: number; d: number; weekday: number } {
  const date = new Date(`${iso}T00:00:00Z`);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), weekday: date.getUTCDay() };
}

/** `iso` plus `days` calendar days. */
export function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "12 nov". */
export function shortDay(iso: string): string {
  const { m, d } = isoParts(iso);
  return `${d} ${MONTHS_SHORT[m]}`;
}

/** "vie 20 nov". */
export function weekdayDay(iso: string): string {
  const { weekday } = isoParts(iso);
  return `${WEEKDAYS_SHORT[weekday]} ${shortDay(iso)}`;
}

/** An inclusive range: "12–16 nov", "30 nov–4 dic"; one day reads "12 nov". */
export function dayRange(from: string, to: string): string {
  if (from === to) return shortDay(from);
  const a = isoParts(from);
  const b = isoParts(to);
  if (a.m === b.m && a.y === b.y) return `${a.d}–${b.d} ${MONTHS_SHORT[b.m]}`;
  return `${shortDay(from)}–${shortDay(to)}`;
}

/** A week column label from its Monday: Monday to Sunday ("9–15 nov"). */
export function weekLabel(monday: string): string {
  return dayRange(monday, plusDays(monday, 6));
}

/** The 4 week Mondays of the team: the first person's `weeks`, else from `today`. */
export function teamWeekStarts(people: PersonDatum[], today: string): string[] {
  const withWeeks = people.find((p) => (p.weeks?.length ?? 0) >= 4);
  if (withWeeks) return withWeeks.weeks!.slice(0, 4).map((w) => w.weekStart);
  const weekday = isoParts(today).weekday;
  const monday = plusDays(today, weekday === 0 ? -6 : 1 - weekday);
  return [0, 7, 14, 21].map((n) => plusDays(monday, n));
}

/** A week is a whole-week absence ("Vac.") when all 5 work days are absent. */
export function isAbsentWeek(week: WeekLoad | undefined): boolean {
  return (week?.absentDays ?? 0) >= 5;
}

/**
 * Disponibilidad text of a person: the absence when absent today ("De
 * vacaciones hasta el 13 nov") or starting soon ("Vacaciones 12–16 nov"),
 * else the load bucket label.
 */
export function availabilityText(person: PersonDatum, today: string): string {
  const status = personStatus(person, today);
  if (status.kind === "ausente") return `De vacaciones hasta el ${shortDay(status.until)}`;
  if (status.kind === "sale") return `Vacaciones ${dayRange(status.from, status.to)}`;
  return LOAD_BUCKET_LABEL[status.bucket];
}

/** The index (0–3) of the week a new task due on `dueDate` lands in; no date → week 1, after week 4 → null. */
export function dueWeekIndex(dueDate: string | null, weekStarts: string[]): number | null {
  if (!dueDate) return 0;
  for (let i = weekStarts.length - 1; i >= 1; i--) {
    if (dueDate >= weekStarts[i]! && dueDate <= plusDays(weekStarts[i]!, 6)) return i;
  }
  const end = weekStarts[0] ? plusDays(weekStarts[0], 6) : null;
  return end !== null && dueDate <= end ? 0 : null;
}

/**
 * Load of the week a new task would land in, client-side: target week = the
 * week of `dueDate` (none → week 1); `(weeks[i].open + 1) ÷ effectiveCapacity`
 * with `effectiveCapacity = capacity × (5 − absentDays) ÷ 5`. Null without
 * capacity data, a whole-week absence or a date after the 4 weeks.
 */
export function impactPct(person: PersonDatum, dueDate: string | null, weekStarts: string[]): { week: number; pct: number } | null {
  const week = dueWeekIndex(dueDate, weekStarts);
  if (week === null) return null;
  const load = person.weeks?.[week];
  const capacity = person.capacity ?? 0;
  const effective = (capacity * (5 - Math.min(5, load?.absentDays ?? 0))) / 5;
  if (effective <= 0) return null;
  return { week, pct: Math.round((((load?.open ?? 0) + 1) / effective) * 100) };
}

// CSV export.

function csvField(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The visible people as CSV (UTF-8 with BOM, `;` separator), one row per
 * person: Persona; Puesto; Tramo; Abiertas; Vencidas; Carga %; the 4 week
 * loads ("Vac." for a whole-week absence); Disponibilidad.
 */
export function personasCsv(rows: PersonDatum[], today: string = localToday()): string {
  const weekStarts = teamWeekStarts(rows, today);
  const header = ["Persona", "Puesto", "Etapa", "Abiertas", "Vencidas", "Carga %", ...weekStarts.map(weekLabel), "Disponibilidad"];
  const lines = [header.map(csvField).join(";")];
  for (const p of rows) {
    const weeks = weekStarts.map((_, i) => {
      const week = p.weeks?.[i];
      if (!week) return "";
      return isAbsentWeek(week) ? "Vac." : String(week.occupancyPct);
    });
    lines.push(
      [
        p.name,
        p.puesto ?? "",
        p.tramo ? tramoLabel(p.tramo) : "",
        p.open,
        p.overdue,
        p.occupancyPct ?? 0,
        ...weeks,
        availabilityText(p, today),
      ]
        .map(csvField)
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** `personas-carga-YYYY-MM-DD.csv`. */
export function personasCsvFileName(today: string): string {
  return `personas-carga-${today}.csv`;
}
