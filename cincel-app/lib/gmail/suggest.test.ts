/** Gmail → project suggestion rules (redesign BE §8.6). */
import { describe, expect, it } from "vitest";

import { normalizeForSuggestion, suggestProjectId } from "./suggest";

const p = (id: string, name: string, updatedAt = "2026-11-01T10:00:00.000Z") => ({ id, name, updatedAt });

describe("normalizeForSuggestion", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(normalizeForSuggestion("  Casa  Pérez-Ñúñez, ¡Fase 2!  ")).toBe("casa perez nunez fase 2");
  });
});

describe("suggestProjectId", () => {
  it("matches a project name as a whole word in the subject, ignoring case and accents", () => {
    const projects = [p("p1", "Casa Pérez"), p("p2", "Torre Norte")];
    expect(suggestProjectId({ subject: "RE: cotización casa perez — planos", snippet: "" }, projects)).toBe("p1");
  });

  it("never matches inside another word", () => {
    expect(suggestProjectId({ subject: "Lofts del Norteño", snippet: "" }, [p("p1", "Norte")])).toBeNull();
    expect(suggestProjectId({ subject: "Casas Pérez", snippet: "" }, [p("p1", "Casa Pérez")])).toBeNull();
  });

  it("ignores names shorter than 4 normalized characters", () => {
    expect(suggestProjectId({ subject: "Avance obra ABC", snippet: "" }, [p("p1", "ABC")])).toBeNull();
    expect(suggestProjectId({ subject: "Avance obra Roble", snippet: "" }, [p("p1", "Roble")])).toBe("p1");
  });

  it("searches the snippet only when it has at least 8 characters", () => {
    const projects = [p("p1", "Roble")];
    expect(suggestProjectId({ subject: "Hola", snippet: "Roble ok" }, projects)).toBe("p1");
    expect(suggestProjectId({ subject: "Hola", snippet: "Roble" }, projects)).toBeNull();
  });

  it("breaks ties with the most recently updated project", () => {
    const projects = [
      p("old", "Casa Roble", "2026-10-01T10:00:00.000Z"),
      p("new", "Roble", "2026-11-05T10:00:00.000Z"),
      p("mid", "Avance", "2026-10-20T10:00:00.000Z"),
    ];
    expect(suggestProjectId({ subject: "Avance Casa Roble", snippet: "" }, projects)).toBe("new");
  });

  it("only ever picks from the projects it was given", () => {
    expect(suggestProjectId({ subject: "Casa Roble", snippet: "" }, [])).toBeNull();
  });
});
