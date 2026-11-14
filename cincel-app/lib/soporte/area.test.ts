// @vitest-environment node
import { describe, expect, it } from "vitest";

import { areaFromPath } from "@/lib/soporte/area";

describe("areaFromPath", () => {
  it.each([
    ["/inicio", "inicio"],
    ["/tareas?vista=lista", "tareas"],
    ["/proyectos/abc/tareas", "proyectos"],
    ["/mi-espacio#notas", "mi-espacio"],
    ["/ajustes/personal", "ajustes"],
    ["/asistente", "asistente"],
    ["/", "otro"],
    ["", "otro"],
    ["/login", "otro"],
    ["/otro", "otro"],
  ])("%s -> %s", (path, area) => {
    expect(areaFromPath(path)).toBe(area);
  });
});
