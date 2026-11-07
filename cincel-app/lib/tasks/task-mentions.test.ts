import { describe, expect, it } from "vitest";

import { normalizeMentionText, resolveMentions, staffFullName } from "./task-mentions";

const ANA = { id: "ana", name: "Ana", lastName: "López" };
const ANA_SOLO = { id: "ana-solo", name: "Ana", lastName: null };
const JOSE = { id: "jose", name: "José María", lastName: "Núñez" };
const LUIS = { id: "luis", name: "Luis", lastName: "Pérez" };
const STAFF = [ANA, ANA_SOLO, JOSE, LUIS];

describe("task mentions", () => {
  it("normalizes case, accents and spacing", () => {
    expect(normalizeMentionText("  JOSÉ   María  Núñez ")).toBe("jose maria nunez");
  });

  it("builds the full name with or without a last name", () => {
    expect(staffFullName(ANA)).toBe("Ana López");
    expect(staffFullName(ANA_SOLO)).toBe("Ana");
  });

  it("resolves @Nombre Apellido case- and accent-insensitively", () => {
    expect(resolveMentions("Revisa esto @ana lopez por favor", STAFF)).toEqual(["ana"]);
    expect(resolveMentions("@JOSE MARIA NUNEZ, ¿lo ves?", STAFF)).toEqual(["jose"]);
  });

  it("prefers the longest exact name at each @", () => {
    expect(resolveMentions("@Ana López y @Ana", STAFF)).toEqual(["ana", "ana-solo"]);
  });

  it("requires a word boundary after the name", () => {
    expect(resolveMentions("@Luis Pérezz", STAFF)).toEqual([]);
    expect(resolveMentions("@Luis Pérez.", STAFF)).toEqual(["luis"]);
  });

  it("returns each person once, in order of first mention", () => {
    expect(resolveMentions("@Luis Pérez @Ana López @luis perez", STAFF)).toEqual(["luis", "ana"]);
  });

  it("ignores text without mentions and unknown names", () => {
    expect(resolveMentions("Sin menciones", STAFF)).toEqual([]);
    expect(resolveMentions("correo@dominio.com @Pedro", STAFF)).toEqual([]);
  });
});
