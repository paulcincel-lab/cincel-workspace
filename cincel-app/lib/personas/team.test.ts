import { describe, expect, it } from "vitest";

import type { PersonDatum } from "@/lib/types/widgets";

import {
  filterTeam,
  filterTeamAnalitico,
  impactPct,
  loadBucket,
  personasCsv,
  peopleWithAvailability,
  personStatus,
  saturationSummary,
  SIN_TRAMO,
  suggestAssignee,
  TEAM_ANALITICO_DEFAULT_FILTERS,
  teamFilterCounts,
  teamPillCounts,
  tramoGroups,
} from "./team";

function person(id: string, availability?: PersonDatum["availability"]): PersonDatum {
  return { id, name: id, initials: id.slice(0, 2).toUpperCase(), open: 0, overdue: 0, availability };
}

const PEOPLE: PersonDatum[] = [
  person("ana", ["ocupado", "ocupado", "saturado", "libre", "libre"]),
  person("bruno", ["libre", "libre", "libre", "vacaciones", "vacaciones"]),
  person("carla", ["libre", "libre", "libre", "libre", "libre"]),
  person("diego"),
];

describe("peopleWithAvailability", () => {
  it("returns the same array without a key", () => {
    expect(peopleWithAvailability(PEOPLE, null)).toBe(PEOPLE);
  });

  it("keeps the people with the key on at least one day, in order", () => {
    expect(peopleWithAvailability(PEOPLE, "saturado").map((p) => p.id)).toEqual(["ana"]);
    expect(peopleWithAvailability(PEOPLE, "libre").map((p) => p.id)).toEqual(["ana", "bruno", "carla"]);
    expect(peopleWithAvailability(PEOPLE, "vacaciones").map((p) => p.id)).toEqual(["bruno"]);
  });

  it("leaves out people without availability and returns an empty list when nobody matches", () => {
    expect(peopleWithAvailability([person("diego")], "libre")).toEqual([]);
    expect(peopleWithAvailability(PEOPLE.slice(2), "saturado")).toEqual([]);
  });
});

describe("saturationSummary", () => {
  const TODAY = "2026-11-11"; // Wednesday
  const load = (id: string, pct: number, patch: Partial<PersonDatum> = {}): PersonDatum => ({
    id,
    name: id,
    initials: id.slice(0, 2).toUpperCase(),
    open: 0,
    overdue: 0,
    tramo: "diseno",
    occupancyPct: pct,
    ...patch,
  });

  it("is null when nobody is over 100 %", () => {
    expect(saturationSummary([load("ana", 100), load("bruno", 85), load("carla", 20)], TODAY)).toBeNull();
    expect(saturationSummary([], TODAY)).toBeNull();
  });

  it("picks the highest load; a tie goes to the most overdue, then the name", () => {
    const people = [
      load("bruno", 120, { overdue: 1 }),
      load("ana", 120, { overdue: 3 }),
      load("carla", 110, { overdue: 9 }),
      load("diego", 120, { overdue: 3 }),
    ];
    expect(saturationSummary(people, TODAY)?.top.id).toBe("ana");
  });

  it("skips a top person who is absent today", () => {
    const people = [
      load("ana", 150, { absences: [{ from: "2026-11-09", to: "2026-11-13", kind: "vacaciones" }] }),
      load("bruno", 110),
    ];
    expect(saturationSummary(people, TODAY)?.top.id).toBe("bruno");
    expect(saturationSummary([people[0]!], TODAY)).toBeNull();
  });

  it("lists up to 3 people in cargado, most loaded first, and suggests a candidate in the same etapa", () => {
    const people = [
      load("ana", 130),
      load("bruno", 80),
      load("carla", 95),
      load("diego", 90),
      load("elena", 99),
      load("fer", 40),
      load("gabi", 10, { tramo: "construccion" }),
    ];
    const summary = saturationSummary(people, TODAY)!;
    expect(summary.nearLimit.map((p) => p.id)).toEqual(["elena", "carla", "diego"]);
    expect(summary.candidate?.id).toBe("fer");
  });
});

// 2026-11-09 is a Monday.
const TODAY = "2026-11-09";

function teammate(id: string, patch: Partial<PersonDatum> = {}): PersonDatum {
  return { id, name: id, initials: id.slice(0, 2).toUpperCase(), open: 0, overdue: 0, ...patch };
}

describe("loadBucket", () => {
  it("loadBucket edges 59/60/79/80/100/101", () => {
    expect(loadBucket(0)).toBe("libre");
    expect(loadBucket(59)).toBe("libre");
    expect(loadBucket(60)).toBe("ocupado");
    expect(loadBucket(79)).toBe("ocupado");
    expect(loadBucket(80)).toBe("cargado");
    expect(loadBucket(100)).toBe("cargado");
    expect(loadBucket(101)).toBe("saturado");
  });
});

describe("personStatus", () => {
  it("personStatus absent today vs leaving in 7 days", () => {
    const absentToday = teammate("ana", { availability: ["vacaciones", "vacaciones", "libre", "libre", "libre"] });
    expect(personStatus(absentToday, TODAY)).toEqual({ kind: "ausente", until: "2026-11-10" });

    const leaving = teammate("bruno", { occupancyPct: 90, availability: ["libre", "libre", "libre", "vacaciones", "vacaciones"] });
    expect(personStatus(leaving, TODAY)).toEqual({ kind: "sale", from: "2026-11-12", to: "2026-11-13" });

    const working = teammate("carla", { occupancyPct: 85, availability: ["ocupado", "ocupado", "ocupado", "ocupado", "ocupado"] });
    expect(personStatus(working, TODAY)).toEqual({ kind: "bucket", bucket: "cargado" });
  });

  it("uses absences when the overview sends them", () => {
    const withRanges = {
      ...teammate("diego", { occupancyPct: 20 }),
      absences: [{ from: "2026-11-14", to: "2026-11-20", kind: "vacaciones" }],
    } as unknown as PersonDatum;
    expect(personStatus(withRanges, TODAY)).toEqual({ kind: "sale", from: "2026-11-14", to: "2026-11-20" });
    expect(personStatus(withRanges, "2026-11-15")).toEqual({ kind: "ausente", until: "2026-11-20" });
    // More than 7 days ahead: still their load bucket.
    expect(personStatus(withRanges, "2026-11-01")).toEqual({ kind: "bucket", bucket: "libre" });
  });
});

describe("suggestAssignee", () => {
  const from = teammate("ana", { name: "Ana", tramo: "diseno", occupancyPct: 120 });

  it("suggestAssignee ignores other etapas, absent people and cargado", () => {
    const people = [
      from,
      teammate("otro", { name: "Otro", tramo: "construccion", occupancyPct: 10 }),
      teammate("fuera", { name: "Fuera", tramo: "diseno", occupancyPct: 5, availability: ["vacaciones", "libre", "libre", "libre", "libre"] }),
      teammate("cargada", { name: "Cargada", tramo: "diseno", occupancyPct: 85 }),
      teammate("libre", { name: "Libre", tramo: "diseno", occupancyPct: 70 }),
    ];
    expect(suggestAssignee(people, from, TODAY)?.id).toBe("libre");
    expect(suggestAssignee(people.slice(0, 4), from, TODAY)).toBeNull();
    expect(suggestAssignee(people, { ...from, tramo: null }, TODAY)).toBeNull();
  });

  it("suggestAssignee tie → name", () => {
    const people = [
      from,
      teammate("z", { name: "Zoe", tramo: "diseno", occupancyPct: 30 }),
      teammate("a", { name: "Álvaro", tramo: "diseno", occupancyPct: 30 }),
      teammate("m", { name: "Marta", tramo: "diseno", occupancyPct: 40 }),
    ];
    expect(suggestAssignee(people, from, TODAY)?.id).toBe("a");
  });
});

describe("teamPillCounts", () => {
  it("teamPillCounts excludes absent people from buckets", () => {
    const people = [
      teammate("libre", { occupancyPct: 10 }),
      teammate("ocupado", { occupancyPct: 65 }),
      teammate("cargado", { occupancyPct: 95 }),
      teammate("saturado", { occupancyPct: 140 }),
      teammate("ausente", { occupancyPct: 140, availability: ["vacaciones", "vacaciones", "vacaciones", "vacaciones", "vacaciones"] }),
      teammate("sale", { occupancyPct: 10, availability: ["libre", "libre", "libre", "libre", "vacaciones"] }),
    ];
    expect(teamPillCounts(people, TODAY)).toEqual({ todos: 6, libre: 1, cargado: 1, saturado: 1, vacaciones: 2 });
  });
});

describe("filterTeam", () => {
  const people = [
    teammate("1", { name: "José Núñez", puesto: "Residente de obra", tramo: "construccion", occupancyPct: 10 }),
    teammate("2", { name: "Ana Ruiz", puesto: "Diseñadora", tramo: "diseno", occupancyPct: 120 }),
    teammate("3", { name: "Luis Pérez", puesto: null, tramo: null, occupancyPct: 90 }),
  ];

  it("filterTeam matches accents and puesto", () => {
    expect(filterTeam(people, { estado: null, q: "jose nunez" }, TODAY).map((p) => p.id)).toEqual(["1"]);
    expect(filterTeam(people, { estado: null, q: "PÉREZ" }, TODAY).map((p) => p.id)).toEqual(["3"]);
    expect(filterTeam(people, { estado: null, q: "residente" }, TODAY).map((p) => p.id)).toEqual(["1"]);
    expect(filterTeam(people, { estado: null, q: "diseño" }, TODAY).map((p) => p.id)).toEqual(["2"]);
    expect(filterTeam(people, { estado: null, q: "construcción" }, TODAY).map((p) => p.id)).toEqual(["1"]);
  });

  it("combines the pill with the search", () => {
    expect(filterTeam(people, { estado: "saturado", q: null }, TODAY).map((p) => p.id)).toEqual(["2"]);
    expect(filterTeam(people, { estado: "cargado", q: "ana" }, TODAY)).toEqual([]);
    expect(filterTeam(people, { estado: null, q: "" }, TODAY)).toHaveLength(3);
  });
});

// ── Personas · Analítico ────────────────────────────────────────────────────

const MONDAYS = ["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
const TRAMOS = [
  { id: "w-pre", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w-dis", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w-con", key: "construccion", name: "Construcción", sortOrder: 3 },
];

function weeks(pcts: number[], open: number[] = pcts.map(() => 0), absentDays: number[] = pcts.map(() => 0)) {
  return MONDAYS.map((weekStart, i) => ({ weekStart, open: open[i] ?? 0, occupancyPct: pcts[i] ?? 0, absentDays: absentDays[i] ?? 0 }));
}

function member(id: string, extra: Partial<PersonDatum>): PersonDatum {
  return { id, name: id, initials: id.slice(0, 2).toUpperCase(), open: 0, overdue: 0, occupancyPct: 0, ...extra };
}

/** Fixture team: 6 people over 3 tramos plus one without tramo. */
const TEAM: PersonDatum[] = [
  member("Ana", { tramo: "diseno", occupancyPct: 112, open: 6, overdue: 4, sharesProjectWithViewer: true }),
  member("Valeria", { tramo: "diseno", occupancyPct: 70, open: 3, sharesProjectWithViewer: false }),
  member("Luis", { tramo: "presale", occupancyPct: 85, open: 4, overdue: 1, sharesProjectWithViewer: true }),
  member("Marta", { tramo: "construccion", occupancyPct: 40, open: 2, sharesProjectWithViewer: true }),
  member("Raúl", { tramo: "construccion", occupancyPct: 20, open: 1, sharesProjectWithViewer: false }),
  member("Zoe", { tramo: null, occupancyPct: 50, open: 1, sharesProjectWithViewer: false }),
];

describe("Personas Analítico helpers", () => {
  it("teamFilterCounts applies the other groups", () => {
    const all = teamFilterCounts(TEAM, TEAM_ANALITICO_DEFAULT_FILTERS, TODAY);
    expect(all.estado).toEqual({ todas: 6, sobrecargadas: 1, "con-capacidad": 4 });
    expect(all.tramo).toEqual({ todos: 6, diseno: 2, presale: 1, construccion: 2, [SIN_TRAMO]: 1 });
    expect(all.alcance).toEqual({ todo: 6, "mi-equipo": 3 });

    // Tramo = Diseño: estado and alcance count only Diseño; tramo counts ignore the tramo filter.
    const diseno = teamFilterCounts(TEAM, { ...TEAM_ANALITICO_DEFAULT_FILTERS, tramo: "diseno" }, TODAY);
    expect(diseno.estado).toEqual({ todas: 2, sobrecargadas: 1, "con-capacidad": 1 });
    expect(diseno.alcance).toEqual({ todo: 2, "mi-equipo": 1 });
    expect(diseno.tramo.todos).toBe(6);

    // Alcance = Solo mi equipo and Estado = Con capacidad: the tramo counts apply both.
    const mine = teamFilterCounts(
      TEAM,
      { ...TEAM_ANALITICO_DEFAULT_FILTERS, alcance: "mi-equipo", estado: "con-capacidad" },
      TODAY,
    );
    expect(mine.tramo).toEqual({ todos: 1, construccion: 1 });
    expect(mine.estado).toEqual({ todas: 3, sobrecargadas: 1, "con-capacidad": 1 });
    expect(filterTeamAnalitico(TEAM, { ...TEAM_ANALITICO_DEFAULT_FILTERS, alcance: "mi-equipo", estado: "con-capacidad" }, TODAY).map((p) => p.id)).toEqual(["Marta"]);

    // The search applies to every group.
    const searched = teamFilterCounts(TEAM, { ...TEAM_ANALITICO_DEFAULT_FILTERS, q: "raul" }, TODAY);
    expect(searched.estado.todas).toBe(1);
  });

  it("tramoGroups puts people without etapa last", () => {
    const groups = tramoGroups(TEAM, TRAMOS);
    expect(groups.map((g) => g.id)).toEqual(["presale", "diseno", "construccion", SIN_TRAMO]);
    expect(groups.at(-1)!.label).toBe("Sin etapa");
    const diseno = groups.find((g) => g.id === "diseno")!;
    expect(diseno.rows!.map((r) => r.id)).toEqual(["Ana", "Valeria"]);
    expect(diseno.caption).toBe("2 personas");
    expect(diseno.metrics.find((m) => m.key === "carga")!.value).toBe("91 %");
    expect(diseno.metrics.find((m) => m.key === "vencidas")).toMatchObject({ value: "4", tone: "destructive" });
    // A tramo with nobody is left out.
    expect(tramoGroups(TEAM.slice(0, 2), TRAMOS).map((g) => g.id)).toEqual(["diseno"]);
  });

  it("personasCsv escapes ; and quotes and adds the BOM", () => {
    const rows = [
      member("a", { name: "Ana; Ruiz", puesto: 'Diseñadora "senior"', tramo: "diseno", open: 6, overdue: 4, occupancyPct: 112, weeks: weeks([112, 104, 86, 60]) }),
      member("b", { name: "Sofía León", tramo: null, open: 2, occupancyPct: 55, weeks: weeks([55, 0, 60, 40], [2, 0, 3, 2], [0, 5, 0, 0]) }),
    ];
    const csv = personasCsv(rows, TODAY);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Persona;Puesto;Etapa;Abiertas;Vencidas;Carga %;9–15 nov;16–22 nov;23–29 nov;30 nov–6 dic;Disponibilidad");
    expect(lines[1]).toBe('"Ana; Ruiz";"Diseñadora ""senior""";Diseño;6;4;112;112;104;86;60;Saturado');
    expect(lines[2]).toBe("Sofía León;;;2;0;55;55;Vac.;60;40;Libre");
  });

  it("impact pct uses the parsed due week", () => {
    const ana = member("Ana", { capacity: 5, weeks: weeks([100, 80, 40, 0], [5, 4, 2, 0], [0, 0, 0, 0]) });
    // No date: week 1, (5 + 1) / 5.
    expect(impactPct(ana, null, MONDAYS)).toEqual({ week: 0, pct: 120 });
    // Due Friday 20 nov: week 2, (4 + 1) / 5.
    expect(impactPct(ana, "2026-11-20", MONDAYS)).toEqual({ week: 1, pct: 100 });
    // Overdue date counts in week 1.
    expect(impactPct(ana, "2026-11-02", MONDAYS)).toEqual({ week: 0, pct: 120 });
    // After the 4 weeks: no impact.
    expect(impactPct(ana, "2026-12-15", MONDAYS)).toBeNull();
    // Absent days lower the capacity: 3 of 5 days → capacity 3, (2 + 1) / 3.
    const away = member("Sofía", { capacity: 5, weeks: weeks([0, 0, 67, 0], [0, 0, 2, 0], [0, 0, 2, 0]) });
    expect(impactPct(away, "2026-11-24", MONDAYS)).toEqual({ week: 2, pct: 100 });
    // No capacity: no impact.
    expect(impactPct(member("x", { capacity: 0, weeks: weeks([0, 0, 0, 0]) }), null, MONDAYS)).toBeNull();
  });
});
