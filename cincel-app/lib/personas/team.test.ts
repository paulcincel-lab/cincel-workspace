import { describe, expect, it } from "vitest";

import type { PersonDatum } from "@/lib/types/widgets";

import { peopleWithAvailability, saturationSummary } from "./team";

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

  it("lists up to 3 people in cargado, most loaded first, and suggests a candidate in the same tramo", () => {
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

  it("suggestAssignee ignores other tramos, absent people and cargado", () => {
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
