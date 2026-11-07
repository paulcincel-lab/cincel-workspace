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
