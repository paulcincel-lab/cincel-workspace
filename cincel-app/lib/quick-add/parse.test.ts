// @vitest-environment node
import { describe, expect, it } from "vitest";

import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import { parseQuickAdd, type QuickAddParseContext, type QuickAddPerson, type QuickAddTramo } from "@/lib/quick-add/parse";
import type { TaskPriority } from "@/lib/types/core";

const PEOPLE: QuickAddPerson[] = [
  { id: "p-ana", name: "Ana Ruiz" },
  { id: "p-luis", name: "Luis Pérez" },
  { id: "p-luisa", name: "Luisa Gómez" },
  { id: "p-sofia", name: "Sofía León" },
  { id: "p-jorge", name: "Jorge Mena" },
  { id: "p-oscar", name: "Oscar Díaz" },
];

const TRAMOS: QuickAddTramo[] = [
  { id: "presale", key: "presale", name: "Presale" },
  { id: "diseno", key: "diseno", name: "Diseño" },
  { id: "construccion", key: "construccion", name: "Construcción" },
  { id: "decoracion", key: "decoracion", name: "Decoración" },
];

/** Monday 2026-11-09. */
const CTX: QuickAddParseContext = { today: "2026-11-09", people: PEOPLE, tramos: TRAMOS, meId: "p-oscar" };

type Row = {
  input: string;
  title: string;
  assigneeId?: string;
  tramoId?: string;
  dueDate?: string;
  priority?: TaskPriority;
  slash?: string;
  today?: string;
  ambiguous?: string[];
  unknown?: string[];
};

const ROWS: Row[] = [
  { input: "Revisar plafones @ana viernes !alta", title: "Revisar plafones", assigneeId: "p-ana", dueDate: "2026-11-13", priority: "alta" },
  { input: "Cotizar tablaroca #construccion 15 nov", title: "Cotizar tablaroca", tramoId: "construccion", dueDate: "2026-11-15" },
  { input: "Enviar renders al cliente mañana #diseño", title: "Enviar renders al cliente", tramoId: "diseno", dueDate: "2026-11-10" },
  { input: "Llamar a proveedor hoy", title: "Llamar a proveedor", dueDate: "2026-11-09" },
  { input: "Junta de obra lunes", title: "Junta de obra", dueDate: "2026-11-16" },
  { input: "Entregar muestras miercoles", title: "Entregar muestras", dueDate: "2026-11-11" },
  { input: "Pasado mañana visitar obra", title: "visitar obra", dueDate: "2026-11-11" },
  { input: "Medir cocina en 3 días", title: "Medir cocina", dueDate: "2026-11-12" },
  { input: "Medir cocina en 2 semanas", title: "Medir cocina", dueDate: "2026-11-23" },
  { input: "Pagar anticipo 20/11", title: "Pagar anticipo", dueDate: "2026-11-20" },
  { input: "Pagar anticipo 05/01", title: "Pagar anticipo", dueDate: "2027-01-05" },
  { input: "Pagar anticipo 9/11", title: "Pagar anticipo", dueDate: "2026-11-09" },
  { input: "Revisar 31/02", title: "Revisar 31/02", unknown: ["31/02"] },
  { input: "Revisión 15 de noviembre", title: "Revisión", dueDate: "2026-11-15" },
  { input: "Junta próxima semana", title: "Junta", dueDate: "2026-11-16" },
  { input: "@lu revisar cotización", title: "@lu revisar cotización", ambiguous: ["p-luis", "p-luisa"] },
  { input: "@luis revisar cotización", title: "revisar cotización", assigneeId: "p-luis" },
  { input: "@perez revisar", title: "revisar", assigneeId: "p-luis" },
  { input: "@zz revisar", title: "@zz revisar", unknown: ["@zz"] },
  { input: "!alta #deco @sofia Elegir lámparas", title: "Elegir lámparas", assigneeId: "p-sofia", tramoId: "decoracion", priority: "alta" },
  { input: "Plano #xyz !urgente", title: "Plano #xyz !urgente", unknown: ["#xyz", "!urgente"] },
  { input: "@yo Preparar junta !b", title: "Preparar junta", assigneeId: "p-oscar", priority: "baja" },
  { input: "Revisar @ana @jorge", title: "Revisar", assigneeId: "p-jorge" },
  { input: "viernes y lunes revisar", title: "y lunes revisar", dueDate: "2026-11-13" },
  { input: "Diseño de cocina", title: "Diseño de cocina" },
  { input: "/ cerrar el tramo de Diseño", title: "", slash: "cerrar el tramo de Diseño" },
  { input: "   ", title: "" },
  {
    input: "mañana",
    title: "",
    dueDate: "2026-11-10",
    today: zonedIsoDate(new Date("2026-11-10T05:30:00Z"), "America/Mexico_City"),
  },
];

describe("parseQuickAdd", () => {
  it.each(ROWS)("parses $input", (row) => {
    const parsed = parseQuickAdd(row.input, { ...CTX, today: row.today ?? CTX.today });
    expect(parsed.title).toBe(row.title);
    expect(parsed.assigneeId).toBe(row.assigneeId);
    expect(parsed.tramoId).toBe(row.tramoId);
    expect(parsed.dueDate).toBe(row.dueDate);
    expect(parsed.priority).toBe(row.priority);
    expect(parsed.slash).toBe(row.slash ?? null);
    const ambiguous = parsed.tokens.filter((t) => t.status === "ambiguous");
    if (row.ambiguous) {
      expect(ambiguous).toHaveLength(1);
      expect(ambiguous[0].candidates?.map((c) => c.id)).toEqual(row.ambiguous);
    } else {
      expect(ambiguous).toEqual([]);
    }
    expect(parsed.tokens.filter((t) => t.status === "unknown").map((t) => t.raw)).toEqual(row.unknown ?? []);
  });

  it("today resolves in the org time zone, not UTC", () => {
    expect(zonedIsoDate(new Date("2026-11-10T05:30:00Z"), "America/Mexico_City")).toBe("2026-11-09");
  });

  it("token offsets point at the raw text", () => {
    const text = "Revisar  @Ana  pasado mañana !Alta";
    const parsed = parseQuickAdd(text, CTX);
    for (const token of parsed.tokens) expect(text.slice(token.start, token.end)).toBe(token.raw);
    expect(parsed.tokens.map((t) => t.raw)).toEqual(["@Ana", "pasado mañana", "!Alta"]);
    expect(parsed.title).toBe("Revisar");
  });

  it("normalizes accents and case", () => {
    expect(parseQuickAdd("Junta MIÉRCOLES @SOFÍA #CONSTRUCCIÓN", CTX)).toMatchObject({
      title: "Junta",
      dueDate: "2026-11-11",
      assigneeId: "p-sofia",
      tramoId: "construccion",
    });
    expect(parseQuickAdd("#dis #cons #de #pre", CTX).tokens.map((t) => t.value)).toEqual([
      "diseno",
      "construccion",
      "decoracion",
      "presale",
    ]);
  });

  it("1-char @ query is unknown", () => {
    const parsed = parseQuickAdd("@a revisar", CTX);
    expect(parsed.title).toBe("@a revisar");
    expect(parsed.tokens).toMatchObject([{ kind: "person", status: "unknown", raw: "@a" }]);
  });

  it("compact full name resolves", () => {
    expect(parseQuickAdd("@anaruiz revisar", CTX).assigneeId).toBe("p-ana");
  });

  it("weekday on its own day jumps a week", () => {
    expect(parseQuickAdd("Junta lunes", CTX).dueDate).toBe("2026-11-16");
    expect(parseQuickAdd("Junta viernes", { ...CTX, today: "2026-11-13" }).dueDate).toBe("2026-11-20");
  });

  it("rollover to next year", () => {
    expect(parseQuickAdd("Pago 8 nov", CTX).dueDate).toBe("2027-11-08");
    expect(parseQuickAdd("Pago 3 de enero", CTX).dueDate).toBe("2027-01-03");
    expect(parseQuickAdd("Pago 05/01/2026", CTX).dueDate).toBe("2026-01-05");
  });

  it("leap day 29/02 only in leap years", () => {
    expect(parseQuickAdd("Pago 29/02", CTX).dueDate).toBeUndefined();
    expect(parseQuickAdd("Pago 29/02/2028", CTX).dueDate).toBe("2028-02-29");
    expect(parseQuickAdd("Pago 29/02/2027", CTX).dueDate).toBeUndefined();
    expect(parseQuickAdd("Pago 29/02", { ...CTX, today: "2028-01-10" }).dueDate).toBe("2028-02-29");
  });

  it("an impossible day stays in the title as unknown", () => {
    const parsed = parseQuickAdd("Revisar 32/1", CTX);
    expect(parsed.title).toBe("Revisar 32/1");
    expect(parsed.tokens).toMatchObject([{ kind: "date", status: "unknown", raw: "32/1" }]);
  });
});

describe("parseQuickAdd estimated hours (~2h, ~30m)", () => {
  it.each([
    ["Revisar planos ~2h", "Revisar planos", 2],
    ["~30m Llamar a proveedor", "Llamar a proveedor", 0.5],
    ["Medir sala ~1.5h viernes", "Medir sala", 1.5],
    ["Medir sala ~1,5h", "Medir sala", 1.5],
    ["Cotizar ~45min", "Cotizar", 0.75],
  ])("%s", (input, title, hours) => {
    const parsed = parseQuickAdd(input, CTX);
    expect(parsed.title).toBe(title);
    expect(parsed.estimatedHours).toBe(hours);
    expect(parsed.tokens.find((t) => t.kind === "hours")?.status).toBe("resolved");
  });

  it("keeps an out-of-range or malformed token in the title", () => {
    for (const input of ["Tarea ~0h", "Tarea ~81h", "Tarea ~abc", "Tarea ~2"]) {
      const parsed = parseQuickAdd(input, CTX);
      expect(parsed.estimatedHours).toBeUndefined();
      expect(parsed.title).toBe(input);
    }
  });

  it("combines with the other tokens", () => {
    const parsed = parseQuickAdd("Planos @ana #diseno mañana !alta ~3h", CTX);
    expect(parsed).toMatchObject({ title: "Planos", assigneeId: "p-ana", tramoId: "diseno", priority: "alta", estimatedHours: 3 });
    expect(parsed.dueDate).toBe("2026-11-10");
  });
});
