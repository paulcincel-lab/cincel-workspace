// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

const fetchEtapasNavAction = vi.fn<() => Promise<WorkflowRef[]>>();

vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchEtapasNavAction: () => fetchEtapasNavAction(),
}));

const user = (access: string, role = "Arquitecto") =>
  ({ member: { id: "s1", role }, email: "x@cincel.mx", access }) as unknown as AuthenticatedUser;

const etapa = (key: string, sortOrder: number, name = key): WorkflowRef => ({
  id: `w-${key}`,
  key,
  name,
  sortOrder,
});

async function loadCompat(withProjectFlowHelper: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/auth/permissions", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
    return withProjectFlowHelper ? actual : { ...actual, canSeeAdminData: undefined };
  });
  return import("../compat");
}

beforeEach(() => {
  fetchEtapasNavAction.mockReset();
  vi.doUnmock("@/lib/auth/permissions");
});

describe("with Project Flow data", () => {
  it("lists the workflows etapas in sortOrder", async () => {
    const { listEtapas } = await loadCompat(true);
    fetchEtapasNavAction.mockResolvedValue([
      etapa("construccion", 3, "Construcción"),
      etapa("presale", 1, "Presale"),
      etapa("diseno", 2, "Diseño"),
    ]);
    expect((await listEtapas()).map((t) => t.key)).toEqual(["presale", "diseno", "construccion"]);
  });

  it("names and colors the four known etapas", async () => {
    const { etapaLabel, etapaColorSlot, etapaColorVar } = await loadCompat(true);
    expect(etapaLabel("presale")).toBe("Presale");
    expect(etapaLabel("diseno")).toBe("Diseño");
    expect(etapaLabel(" Construccion ")).toBe("Construcción");
    expect(etapaColorSlot("presale")).toBe(1);
    expect(etapaColorSlot("diseno")).toBe(2);
    expect(etapaColorSlot("construccion")).toBe(3);
    expect(etapaColorSlot("decoracion")).toBe(4);
    expect(etapaColorVar("diseno")).toBe("var(--chart-2)");
    expect(etapaColorVar("decoracion")).toBe("var(--chart-4)");
  });

  it("names a fase from its catalog", async () => {
    const { phaseLabel } = await loadCompat(true);
    const catalog: WorkflowPhaseRef[] = [
      { id: "f1", name: "Anteproyecto", sortOrder: 0 },
      { id: "f2", name: "Proyecto ejecutivo", sortOrder: 1 },
    ];
    expect(phaseLabel("f2", catalog)).toBe("Proyecto ejecutivo");
    expect(phaseLabel("f9", catalog)).toBeNull();
  });

  it("uses Project Flow's admin gate (Administrador access)", async () => {
    const { canSeeAdminData } = await loadCompat(true);
    const permissions = await import("@/lib/auth/permissions");
    expect(canSeeAdminData).toBe(permissions.canSeeAdminData);
    expect(canSeeAdminData(user("Administrador"))).toBe(true);
    expect(canSeeAdminData(user("Usuario", "Administrador"))).toBe(false);
    expect(canSeeAdminData(null)).toBe(false);
  });
});

describe("without Project Flow data", () => {
  it("lists plain workflows rows, empty when there are none", async () => {
    const { listEtapas } = await loadCompat(false);
    fetchEtapasNavAction.mockResolvedValue([]);
    expect(await listEtapas()).toEqual([]);

    fetchEtapasNavAction.mockResolvedValue([etapa("b", 1, "Beta"), etapa("a", 1, "Alfa"), etapa("", 0)]);
    expect((await listEtapas()).map((t) => t.name)).toEqual(["Alfa", "Beta"]);
  });

  it("falls back to a readable label and the neutral color for unknown keys", async () => {
    const { etapaLabel, etapaColorSlot, etapaColorVar } = await loadCompat(false);
    expect(etapaLabel("decoracion")).toBe("Decoración");
    expect(etapaLabel("obra_gris")).toBe("Obra gris");
    expect(etapaLabel("  ")).toBe("");
    expect(etapaColorSlot("obra_gris")).toBeNull();
    expect(etapaColorSlot("")).toBeNull();
    expect(etapaColorVar("otro")).toBe("var(--muted-foreground)");
  });

  it("colors an etapa outside the known keys by its sortOrder (frame `Sidebar`: Decoración → chart-4)", async () => {
    const { etapaColorVar } = await loadCompat(false);
    expect(etapaColorVar("decoracion", 4)).toBe("var(--chart-4)");
    expect(etapaColorVar("presale", 9)).toBe("var(--chart-1)");
    expect(etapaColorVar("otro", 0)).toBe("var(--muted-foreground)");
    expect(etapaColorVar("otro", 12)).toBe("var(--muted-foreground)");
  });

  it("returns null fase labels while no fase catalog exists", async () => {
    const { phaseLabel } = await loadCompat(false);
    expect(phaseLabel("f1")).toBeNull();
    expect(phaseLabel("f1", null)).toBeNull();
    expect(phaseLabel("f1", [])).toBeNull();
    expect(phaseLabel("", [{ id: "", name: "x", sortOrder: 0 }])).toBeNull();
  });

  it("falls back to isAdministratorRole for admin data", async () => {
    const { canSeeAdminData } = await loadCompat(false);
    expect(canSeeAdminData(user("Usuario", "Administrador"))).toBe(true);
    expect(canSeeAdminData(user("Administrador", "Arquitecto"))).toBe(false);
    expect(canSeeAdminData(undefined)).toBe(false);
  });
});
