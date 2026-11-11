import { describe, expect, it } from "vitest";

import { withCompletadasParam, withMiEspacioCompletadasParam } from "./use-hide-completed";

describe("withCompletadasParam", () => {
  it("sets ?completadas=0 to hide and removes it to show, keeping the other params", () => {
    expect(withCompletadasParam("/proyectos/p1/tareas?estado=vencidas", true)).toBe("/proyectos/p1/tareas?estado=vencidas&completadas=0");
    expect(withCompletadasParam("/mi-espacio?completadas=0&q=a", false)).toBe("/mi-espacio?q=a");
    expect(withCompletadasParam("/mi-espacio?completadas=1", false)).toBe("/mi-espacio");
    expect(withCompletadasParam("/proyectos/p1#s-tareas", true)).toBe("/proyectos/p1?completadas=0#s-tareas");
  });
});

describe("withMiEspacioCompletadasParam", () => {
  it("hidden is the default there: showing sets ?completadas=1, hiding removes it", () => {
    expect(withMiEspacioCompletadasParam("/mi-espacio?q=a", false)).toBe("/mi-espacio?q=a&completadas=1");
    expect(withMiEspacioCompletadasParam("/mi-espacio?completadas=1&q=a", true)).toBe("/mi-espacio?q=a");
    expect(withMiEspacioCompletadasParam("/mi-espacio?completadas=0", true)).toBe("/mi-espacio");
  });
});
