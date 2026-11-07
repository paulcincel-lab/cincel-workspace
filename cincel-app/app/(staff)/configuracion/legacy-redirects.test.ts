import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);
// Flag off: the redesign stub returns and the legacy redirect runs.
vi.mock("@/lib/ui/legacy-redirects-server", () => ({ redirectLegacyIfRedesignOn: vi.fn(async () => {}) }));

import ConfiguracionAreasPage from "./areas/page";
import ConfiguracionWorkflowsPage from "./workflows/page";

const props = { searchParams: Promise.resolve({}) };

describe("legacy Configuración routes", () => {
  it("sends /configuracion/areas to Puestos", async () => {
    await expect(ConfiguracionAreasPage(props)).rejects.toThrow("NEXT_REDIRECT:/configuracion/puestos");
    expect(navigation.redirect).toHaveBeenLastCalledWith("/configuracion/puestos");
  });

  it("sends /configuracion/workflows to Tramos y fases", async () => {
    await expect(ConfiguracionWorkflowsPage(props)).rejects.toThrow("NEXT_REDIRECT:/configuracion/tramos");
    expect(navigation.redirect).toHaveBeenLastCalledWith("/configuracion/tramos");
  });
});
