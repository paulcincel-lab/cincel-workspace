// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import axe from "axe-core";

import { buildDefaultPermissionsState, getEnabledModuleNames } from "@/lib/auth/permissionsState";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { AjustesPermisosPageData, PermisosStaffRow } from "@/lib/types/ajustes-catalogs";
import { THEME_IDS } from "@/lib/ui/themes";

const pageData = vi.hoisted(() => ({ getAjustesPermisosPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { PermisosSettings, peopleSummary } from "./PermisosSettings";

/** The browser key the removed editor wrote (#950). */
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
  const data: AjustesPermisosPageData = { staff: STAFF, defaultPermissions: DEFAULTS };
  client.setQueryData(qk.ajustes.page("permisos"), data);
  return renderWithQueryClient(<PermisosSettings />, { client });
}

describe("Ajustes › Permisos (read-only, #950)", () => {
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

  it("lists every access with its people and its default modules", () => {
    renderPage();

    const people = screen.getByRole("region", { name: "Personas por acceso" });
    expect(within(people).getByRole("group", { name: "Administrador" })).toBeTruthy();
    expect(within(people).getByText(/María, Luis, Sofía y 1 más/)).toBeTruthy();
    expect(within(people).getByText("4 personas")).toBeTruthy();
    const firstModule = getEnabledModuleNames(DEFAULTS["Colaborador"])[0];
    if (firstModule) expect(within(people).getAllByText(new RegExp(`Módulos: .*${firstModule}`)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cada rol usa los permisos por defecto/)).toBeTruthy();
  });

  it("has no editor: no Configurar, Guardar cambios, Restaurar or permission controls", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /Configurar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restaurar permisos por defecto" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("region", { name: /^Permisos de / })).toBeNull();
  });

  it("removes the browser-only matrix once on mount", () => {
    window.localStorage.setItem(LEGACY_MATRIX_KEY, JSON.stringify({ version: 1, roles: {} }));
    renderPage();
    expect(window.localStorage.getItem(LEGACY_MATRIX_KEY)).toBeNull();
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
