// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

const fetchTramosNavAction = vi.fn<() => Promise<WorkflowRef[]>>();

vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchTramosNavAction: () => fetchTramosNavAction(),
}));

const user = (access: string, role = "Arquitecto") =>
  ({ member: { id: "s1", role }, email: "x@cincel.mx", access }) as unknown as AuthenticatedUser;

const tramo = (key: string, sortOrder: number, name = key): WorkflowRef => ({
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
  fetchTramosNavAction.mockReset();
  vi.doUnmock("@/lib/auth/permissions");
});

describe("with Project Flow data", () => {
  it("lists the workflows etapas in sortOrder", async () => {
    const { listTramos } = await loadCompat(true);
    fetchTramosNavAction.mockResolvedValue([
      tramo("construccion", 3, "Construcción"),
      tramo("presale", 1, "Presale"),
      tramo("diseno", 2, "Diseño"),
    ]);
    expect((await listTramos()).map((t) => t.key)).toEqual(["presale", "diseno", "construccion"]);
  });

  it("names and colors the four known etapas", async () => {
    const { tramoLabel, tramoColorSlot, tramoColorVar } = await loadCompat(true);
    expect(tramoLabel("presale")).toBe("Presale");
    expect(tramoLabel("diseno")).toBe("Diseño");
    expect(tramoLabel(" Construccion ")).toBe("Construcción");
    expect(tramoColorSlot("presale")).toBe(1);
    expect(tramoColorSlot("diseno")).toBe(2);
    expect(tramoColorSlot("construccion")).toBe(3);
    expect(tramoColorSlot("decoracion")).toBe(4);
    expect(tramoColorVar("diseno")).toBe("var(--chart-2)");
    expect(tramoColorVar("decoracion")).toBe("var(--chart-4)");
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
    const { listTramos } = await loadCompat(false);
    fetchTramosNavAction.mockResolvedValue([]);
    expect(await listTramos()).toEqual([]);

    fetchTramosNavAction.mockResolvedValue([tramo("b", 1, "Beta"), tramo("a", 1, "Alfa"), tramo("", 0)]);
    expect((await listTramos()).map((t) => t.name)).toEqual(["Alfa", "Beta"]);
  });

  it("falls back to a readable label and the neutral color for unknown keys", async () => {
    const { tramoLabel, tramoColorSlot, tramoColorVar } = await loadCompat(false);
    expect(tramoLabel("decoracion")).toBe("Decoración");
    expect(tramoLabel("obra_gris")).toBe("Obra gris");
    expect(tramoLabel("  ")).toBe("");
    expect(tramoColorSlot("obra_gris")).toBeNull();
    expect(tramoColorSlot("")).toBeNull();
    expect(tramoColorVar("otro")).toBe("var(--muted-foreground)");
  });

  it("colors a etapa outside the known keys by its sortOrder (frame `Sidebar`: Decoración → chart-4)", async () => {
    const { tramoColorVar } = await loadCompat(false);
    expect(tramoColorVar("decoracion", 4)).toBe("var(--chart-4)");
    expect(tramoColorVar("presale", 9)).toBe("var(--chart-1)");
    expect(tramoColorVar("otro", 0)).toBe("var(--muted-foreground)");
    expect(tramoColorVar("otro", 12)).toBe("var(--muted-foreground)");
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
