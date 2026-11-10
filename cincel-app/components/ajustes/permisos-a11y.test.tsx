// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import { buildDefaultPermissionsState, getEnabledModuleNames } from "@/lib/auth/permissionsState";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { AjustesPermisosPageData, PermisosStaffRow } from "@/lib/types/ajustes-catalogs";
import { THEME_IDS } from "@/lib/ui/themes";
import { settle } from "@/tests/helpers/settle";

const pageData = vi.hoisted(() => ({ getAjustesPermisosPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const writes = vi.hoisted(() => ({ savePermissionsMatrixAction: vi.fn(), restoreDefaultPermissionsAction: vi.fn() }));
vi.mock("@/lib/actions/permissions-actions", () => writes);


import { PermisosSettings, peopleSummary } from "./PermisosSettings";

/** The browser key the removed editor wrote (#950); nothing reads or writes it now. */
const LEGACY_MATRIX_KEY = "cincel.permissions.custom.v1";

function member(id: string, name: string, access: PermisosStaffRow["access"]): PermisosStaffRow {
  return { id, name, lastName: null, active: true, access };
}

const STAFF: PermisosStaffRow[] = [
  member("a1", "Alejandro", "Administrador"),
  member("c1", "María", "Colaborador"),
  member("c2", "Luis", "Colaborador"),
  member("c3", "Sofía", "Colaborador"),
  member("c4", "Rafa", "Colaborador"),
];

const DEFAULTS = buildDefaultPermissionsState();

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function applyTheme(theme: string, mode: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", theme);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

/** Renders the page under a client hydrated with the page data, as the page's prefetch leaves it. */
function renderPage() {
  const client = createTestQueryClient();
  const data: AjustesPermisosPageData = { staff: STAFF, defaultPermissions: DEFAULTS, permissions: DEFAULTS, hasCustom: false };
  client.setQueryData(qk.ajustes.page("permisos"), data);
  return renderWithQueryClient(<PermisosSettings />, { client });
}

describe("Ajustes › Permisos (#950, #971)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    const root = document.documentElement;
    root.removeAttribute("data-theme-id");
    root.removeAttribute("data-theme");
    root.classList.remove("dark");
  });

  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = renderPage();
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("shows the matrix with people per access and the default permissions", () => {
    renderPage();

    expect(screen.queryByText(/Próximamente/)).toBeNull();
    const section = screen.getByRole("region", { name: "Permisos por acceso" });
    const table = within(section).getByRole("table", { name: "Permisos por acceso" });
    const peopleRow = within(table).getByRole("rowheader", { name: "Personas por acceso" }).closest("tr")!;
    const cells = within(peopleRow).getAllByRole("cell").map((cell) => cell.textContent);
    // Administrador first, Colaborador's four people.
    expect(cells[0]).toBe("1");
    expect(cells).toContain("4");
    expect(within(section).getByText(/Admin tiene acceso completo y no se puede editar\./)).toBeTruthy();
  });

  it("expands a module into its capabilities", () => {
    renderPage();
    const toggle = screen.getAllByRole("button", { expanded: false })[0]!;
    const moduleName = toggle.textContent ?? "";
    expect(moduleName).toMatch(/capacidad/);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const firstModule = getEnabledModuleNames(DEFAULTS["Administrador"])[0];
    expect(firstModule).toBeTruthy();
    expect(screen.getAllByText("Puede").length).toBeGreaterThan(0);
  });

  it("edits the matrix: Administrador and capped exports are read only, the rest are controls", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Proyectos/ }));
    expect(screen.queryByRole("checkbox", { name: "Eliminar proyecto · Administrador" })).toBeNull();
    const direccion = screen.getByRole("checkbox", { name: "Eliminar proyecto · Dirección" });
    expect(direccion.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Exportar datos · Dirección" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Exportar datos · Colaborador" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Crear proyecto · Colaborador" }).getAttribute("aria-checked")).toBe("false");
  });

  it("saves the draft through the action and stores nothing in the browser", async () => {
    writes.savePermissionsMatrixAction.mockImplementation(async ({ permissions }) => ({
      ok: true,
      data: { permissions, hasCustom: true, changed: 1 },
    }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Proyectos/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Crear proyecto · Colaborador" }));
    expect(screen.getByText("1 cambio sin guardar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guardar permisos" }));
    await waitFor(() => expect(writes.savePermissionsMatrixAction).toHaveBeenCalledTimes(1));
    const sent = writes.savePermissionsMatrixAction.mock.calls[0]![0].permissions;
    expect(sent.Colaborador.projects.canCreateProject).toBe(true);
    expect(sent.Dirección.projects.canCreateProject).toBe(true);
    await waitFor(() => expect(screen.queryByText("1 cambio sin guardar")).toBeNull());
    await settle();
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LEGACY_MATRIX_KEY)).toBeNull();
  });

  it("discards the draft", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Clientes/ }));
    const box = screen.getByRole("checkbox", { name: "Ver clientes · Otros" });
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByRole("checkbox", { name: "Ver clientes · Otros" }).getAttribute("aria-checked")).toBe("false");
    expect(writes.savePermissionsMatrixAction).not.toHaveBeenCalled();
  });

  it("restoring the defaults is off while the matrix has no saved changes", () => {
    renderPage();
    expect((screen.getByRole("button", { name: "Restaurar valores por defecto" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("registers no focus or storage listener and makes no call on mount", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderPage();
    const events = add.mock.calls.map((call) => call[0]);
    expect(events).not.toContain("focus");
    expect(events).not.toContain("storage");
    expect(pageData.getAjustesPermisosPageData).not.toHaveBeenCalled();
  });
});

describe("peopleSummary", () => {
  it("reads naturally in Spanish", () => {
    expect(peopleSummary([])).toBe("Sin personas con este acceso");
    expect(peopleSummary([member("1", "Ana", "Otros")])).toBe("Ana");
    expect(peopleSummary([member("1", "Ana", "Otros"), member("2", "Luis", "Otros")])).toBe("Ana y Luis");
    expect(peopleSummary(STAFF.slice(1, 4))).toBe("María, Luis y Sofía");
    expect(peopleSummary(STAFF)).toBe("Alejandro, María, Luis y 2 más");
  });
});
