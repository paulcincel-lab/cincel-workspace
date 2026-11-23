import { describe, expect, it } from "vitest";

import { isNavKeyVisible, parseNavVisibility, sanitizeHiddenKeys } from "./nav-visibility";

describe("sanitizeHiddenKeys", () => {
  it("keeps known keys once and drops unknown ones and Ajustes", () => {
    expect(sanitizeHiddenKeys(["inicio", "inicio", "x", "ajustes", "search", "etapas", "tareas:proyectos"])).toEqual([
      "inicio",
      "search",
      "etapas",
      "tareas:proyectos",
    ]);
  });

  it("drops the etapa keys that no longer exist when it knows them", () => {
    expect(sanitizeHiddenKeys(["etapa:a", "etapa:b", "etapa:"], new Set(["a"]))).toEqual(["etapa:a"]);
  });

  it("gives nothing for a value that is not a list", () => {
    expect(sanitizeHiddenKeys("inicio")).toEqual([]);
    expect(sanitizeHiddenKeys([1, null])).toEqual([]);
  });
});

describe("parseNavVisibility", () => {
  it("defaults to nothing hidden", () => {
    expect(parseNavVisibility(null)).toEqual({ version: 1, hidden: [] });
    expect(parseNavVisibility("{bad")).toEqual({ version: 1, hidden: [] });
    expect(parseNavVisibility(JSON.stringify({ version: 2, hidden: ["inicio"] }))).toEqual({ version: 1, hidden: [] });
  });

  it("reads the stored keys", () => {
    expect(parseNavVisibility(JSON.stringify({ version: 1, hidden: ["inicio", "zzz"] }))).toEqual({
      version: 1,
      hidden: ["inicio"],
    });
  });
});

describe("isNavKeyVisible", () => {
  it("is true unless the key is hidden", () => {
    expect(isNavKeyVisible(["jornada"], "jornada")).toBe(false);
    expect(isNavKeyVisible(["jornada"], "search")).toBe(true);
    expect(isNavKeyVisible(undefined, "search")).toBe(true);
  });
});
