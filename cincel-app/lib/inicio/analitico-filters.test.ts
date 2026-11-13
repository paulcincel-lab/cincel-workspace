import { describe, expect, it } from "vitest";

import type { InicioAgendaItem, InicioEtapaAssigneeRow } from "@/lib/types/redesign";
import type { AttentionItem, DistributionSegment, PersonDatum } from "@/lib/types/widgets";

import { filterAgenda, filterAttention, filterEtapas, filterWorkload, hasActiveFilters } from "./analitico-filters";

const LUIS = { id: "s-1", name: "Luis Pérez", initials: "LP" };
const ANA = { id: "s-2", name: "Ana Ruiz", initials: "AR" };

function attention(id: string, assignee: AttentionItem["assignee"], etapa: string | null): AttentionItem {
  return {
    id,
    title: id,
    href: `/tareas?tarea=${id}`,
    project: "Oficina Polanco",
    projectId: "p-1",
    etapa,
    reason: "Vencida",
    tone: "critical",
    assignee,
    due: "2026-11-01",
    daysLate: 8,
  };
}

const ATTENTION = [attention("a", LUIS, "diseno"), attention("b", ANA, "diseno"), attention("c", ANA, "presale")];

const PEOPLE: PersonDatum[] = [
  { id: LUIS.id, name: LUIS.name, initials: LUIS.initials, open: 3, overdue: 1 },
  { id: ANA.id, name: ANA.name, initials: ANA.initials, open: 5, overdue: 2 },
];

const SPLIT: InicioEtapaAssigneeRow[] = [
  { etapa: "diseno", assigneeId: LUIS.id, open: 2, overdue: 1, ageDays: 10 },
  { etapa: "presale", assigneeId: LUIS.id, open: 1, overdue: 0, ageDays: 3 },
  { etapa: "diseno", assigneeId: ANA.id, open: 5, overdue: 2, ageDays: 30 },
];

const ETAPAS: DistributionSegment[] = [
  { key: "presale", label: "Presale", value: 1, colorVar: "var(--chart-1)", secondary: 0, extra: { diasProm: 3 } },
  { key: "diseno", label: "Diseño", value: 7, colorVar: "var(--chart-2)", secondary: 3, extra: { diasProm: 5.7 } },
];

const AGENDA: InicioAgendaItem[] = [
  { id: "e-1", title: "Junta", start: "2026-11-09T10:00", project: "Oficina Polanco", etapa: "diseno", kind: "evento", assignee: LUIS },
  { id: "e-2", title: "Entrega planos", start: "2026-11-09", allDay: true, etapa: "presale", kind: "entrega", assignee: ANA },
  { id: "e-3", title: "Visita", start: "2026-11-09T12:00", etapa: null, kind: "evento", assignee: null },
];

const NONE = { responsable: null, etapa: null };

describe("Inicio Analítico filters", () => {
  it("filters by responsable", () => {
    const f = { responsable: ANA.id, etapa: null };
    expect(hasActiveFilters(f)).toBe(true);
    expect(filterAttention(ATTENTION, f).map((a) => a.id)).toEqual(["b", "c"]);
    expect(filterWorkload(PEOPLE, f, SPLIT).map((p) => p.id)).toEqual([ANA.id]);
    expect(filterAgenda(AGENDA, f).map((a) => a.id)).toEqual(["e-2"]);
    // Etapas recounted from Luis's open tasks only.
    const luis = filterEtapas(ETAPAS, { responsable: LUIS.id, etapa: null }, SPLIT);
    expect(luis.map((s) => [s.key, s.value, s.secondary, s.extra?.diasProm])).toEqual([
      ["presale", 1, 0, 3],
      ["diseno", 2, 1, 5],
    ]);
    // Ana has nothing in Presale: the segment is dropped.
    expect(filterEtapas(ETAPAS, f, SPLIT).map((s) => s.key)).toEqual(["diseno"]);
  });

  it("filters by etapa", () => {
    const f = { responsable: null, etapa: "presale" };
    expect(filterAttention(ATTENTION, f).map((a) => a.id)).toEqual(["c"]);
    expect(filterEtapas(ETAPAS, f, SPLIT).map((s) => s.key)).toEqual(["presale"]);
    // Only the people with open tasks in Presale.
    expect(filterWorkload(PEOPLE, f, SPLIT).map((p) => p.id)).toEqual([LUIS.id]);
    expect(filterAgenda(AGENDA, f).map((a) => a.id)).toEqual(["e-2"]);
    // Both filters together.
    expect(filterAttention(ATTENTION, { responsable: ANA.id, etapa: "diseno" }).map((a) => a.id)).toEqual(["b"]);
  });

  it("no filter returns input", () => {
    expect(hasActiveFilters(NONE)).toBe(false);
    expect(filterAttention(ATTENTION, NONE)).toBe(ATTENTION);
    expect(filterWorkload(PEOPLE, NONE, SPLIT)).toBe(PEOPLE);
    expect(filterEtapas(ETAPAS, NONE, SPLIT)).toBe(ETAPAS);
    expect(filterAgenda(AGENDA, NONE)).toBe(AGENDA);
  });
});
