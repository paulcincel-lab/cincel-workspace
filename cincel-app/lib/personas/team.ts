/**
 * Personas · Equipo data shaping (redesign FE §3.6, §4.7). Pure and
 * client-safe: joins the staff DTOs with the `fetchPeopleOverviewAction` rows
 * into the `PersonDatum` shape the people widgets render.
 */
import type { PeopleOverviewRow, PresentationStyle } from "@/lib/types/redesign";
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
    };
    if (row) {
      person.activeProjects = row.activeProjects;
      person.occupancyPct = row.occupancyPct;
      if (row.availability.length > 0) person.availability = row.availability;
      if (row.weeks) person.weeks = row.weeks;
      if (row.absences) person.absences = row.absences;
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

const byLoadThenName = (a: PersonDatum, b: PersonDatum): number =>
  (b.occupancyPct ?? 0) - (a.occupancyPct ?? 0) || a.name.localeCompare(b.name, "es", { sensitivity: "base" });

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
