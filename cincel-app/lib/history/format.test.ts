import { describe, expect, it } from "vitest";

import type { HistoryEvent } from "@/lib/types/core";

import { historyEventText, historyFieldLabel, historyValueText } from "./format";

const ANA = "807026ea-1111-4222-8333-444455556666";
const LUIS = "cf46aaaa-1111-4222-8333-444455556666";
const GHOST = "11111111-2222-4333-8444-555555555555";
const names = new Map([
  [ANA, "Ana López"],
  [LUIS, "Luis Pérez"],
  ["ph1", "Planos"],
]);

const change = (field: string | null, beforeValue: string | null, afterValue: string | null): HistoryEvent => ({
  id: "e",
  entity: "task",
  entityId: "t",
  kind: "cambio",
  actor: null,
  field,
  beforeValue,
  afterValue,
  comment: null,
  eventAt: "2026-03-05T10:00:00.000Z",
});

describe("historyEventText", () => {
  it("resolves staff ids of the responsable", () => {
    expect(historyEventText(change("managerId", ANA, LUIS), names)).toBe("Cambió responsable: Ana López → Luis Pérez");
  });

  it("formats dates like the rest of the app", () => {
    expect(historyEventText(change("deliveryDate", "2026-09-29", "2026-11-10"))).toBe(
      "Cambió fecha de entrega: 29-09-2026 → 10-11-2026",
    );
  });

  it("labels the base status and the priority", () => {
    expect(historyEventText(change("status", "pendiente", "en_proceso"))).toBe("Cambió estado: Pendiente → En proceso");
    expect(historyEventText(change("priority", "alta", "baja"))).toBe("Cambió prioridad: Alta → Baja");
  });

  it("resolves fase and custom status ids", () => {
    expect(historyEventText(change("phaseId", null, "ph1"), names)).toBe("Cambió fase: — → Planos");
  });

  it("shows a dash for an id it cannot resolve", () => {
    expect(historyEventText(change("managerId", GHOST, ANA), names)).toBe("Cambió responsable: — → Ana López");
    expect(historyEventText(change("managerId", ANA, null))).toBe("Cambió responsable: — → —");
  });

  it("never leaks ids in the equipo de apoyo", () => {
    expect(historyEventText(change("support", "", ANA), names)).toBe("Cambió el equipo de apoyo: — → Ana López");
    expect(historyEventText(change("support", GHOST, "Ana López, Luis Pérez"), names)).toBe(
      "Cambió el equipo de apoyo: — → Ana López, Luis Pérez",
    );
  });

  it("words a etapa move and booleans and hours", () => {
    expect(historyEventText(change("tramo", "Diseño", "Construcción"))).toBe("Movió la tarea de Diseño a Construcción");
    expect(historyEventText(change("archived", "false", "true"))).toBe("Cambió archivada: No → Sí");
    expect(historyEventText(change("estimatedHours", "2", "4"))).toBe("Cambió horas estimadas: 2 h → 4 h");
  });

  it("falls back to a readable label for an unknown field", () => {
    expect(historyFieldLabel("lastReviewedAt")).toBe("last reviewed at");
    expect(historyFieldLabel("someColumnId")).toBe("some column");
    expect(historyFieldLabel(null)).toBe("un campo");
    expect(historyEventText(change("lastReviewedBy", ANA, null), names)).not.toMatch(/[a-z][A-Z]/);
  });

  it("keeps free text and handles empty sides", () => {
    expect(historyEventText(change("title", "Planos", "Planos v2"))).toBe("Cambió título: Planos → Planos v2");
    expect(historyValueText("title", "")).toBe("—");
    expect(historyValueText("title", null)).toBe("—");
  });

  it("returns the comment of a comentario", () => {
    expect(historyEventText({ ...change(null, null, null), kind: "comentario", comment: "Hola" })).toBe("Hola");
  });
});
