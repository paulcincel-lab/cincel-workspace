import { describe, expect, it } from "vitest";

import { withCurrentEstilo } from "./use-tareas-page";

describe("withCurrentEstilo", () => {
  it("keeps the current ?estilo= on a filter change, unless the href names one", () => {
    expect(withCurrentEstilo("/tareas?completadas=0", "?estilo=analitico&proyecto=p")).toBe("/tareas?completadas=0&estilo=analitico");
    expect(withCurrentEstilo("/tareas", "?estilo=analitico")).toBe("/tareas?estilo=analitico");
    expect(withCurrentEstilo("/tareas?estilo=visual", "?estilo=analitico")).toBe("/tareas?estilo=visual");
    expect(withCurrentEstilo("/tareas?q=a", "")).toBe("/tareas?q=a");
  });
});
