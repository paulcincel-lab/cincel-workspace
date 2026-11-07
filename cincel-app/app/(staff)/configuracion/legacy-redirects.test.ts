import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

import ConfiguracionAreasPage from "./areas/page";
import ConfiguracionWorkflowsPage from "./workflows/page";

describe("legacy Configuración routes", () => {
  it("sends /configuracion/areas to Puestos", () => {
    expect(() => ConfiguracionAreasPage()).toThrow("NEXT_REDIRECT:/configuracion/puestos");
    expect(navigation.redirect).toHaveBeenLastCalledWith("/configuracion/puestos");
  });

  it("sends /configuracion/workflows to Tramos y fases", () => {
    expect(() => ConfiguracionWorkflowsPage()).toThrow("NEXT_REDIRECT:/configuracion/tramos");
    expect(navigation.redirect).toHaveBeenLastCalledWith("/configuracion/tramos");
  });
});
