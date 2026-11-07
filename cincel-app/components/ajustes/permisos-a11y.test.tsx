// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";

import { PERMISSIONS_CUSTOM_STORAGE_KEY } from "@/lib/auth/permissions";
import { buildDefaultPermissionsState } from "@/lib/auth/permissionsState";
import type { Staff } from "@/lib/types/core";
import { THEME_IDS } from "@/lib/ui/themes";

const staffActions = vi.hoisted(() => ({ fetchStaffAction: vi.fn(async () => [] as unknown[]) }));
vi.mock("@/lib/actions/staff-actions", () => staffActions);

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { PermisosSettings, peopleSummary } from "./PermisosSettings";

function member(id: string, name: string, role: string): Staff {
  return { id, name, role, email: `${id}@example.test`, active: true } as unknown as Staff;
}

const STAFF: Staff[] = [
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

function renderPage() {
  return render(<PermisosSettings initialStaff={STAFF} defaultPermissions={DEFAULTS} />);
}

describe("Ajustes › Permisos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
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

  it("lists every access with its people and opens the editor on Dirección", () => {
    renderPage();

    const people = screen.getByRole("region", { name: "Personas por acceso" });
    expect(within(people).getByRole("group", { name: "Administrador" })).toBeTruthy();
    expect(within(people).getByText(/María, Luis, Sofía y 1 más/)).toBeTruthy();
    expect(within(people).getByText("4 personas")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Permisos de Dirección" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Configurar Dirección" }).getAttribute("aria-pressed")).toBe("true");
    // Administrador keeps full access and can't be edited.
    expect(screen.getByRole("button", { name: "Configurar Administrador" }).hasAttribute("disabled")).toBe(true);
  });

  it("switches the editor to another access", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Configurar Colaborador" }));

    expect(screen.getByRole("region", { name: "Permisos de Colaborador" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Configurar Colaborador" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("saves to the same browser storage as before and restores the defaults", () => {
    renderPage();
    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect(save.hasAttribute("disabled")).toBe(true);

    const toggle = screen.getByRole("switch", { name: "Ver asignaciones de proyecto" });
    const before = toggle.getAttribute("aria-checked") === "true";
    fireEvent.click(toggle);
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);

    const stored = JSON.parse(window.localStorage.getItem(PERMISSIONS_CUSTOM_STORAGE_KEY) ?? "null");
    expect(stored.version).toBe(1);
    expect(stored.roles["Dirección"].dashboard.showProjectAssignments).toBe(!before);
    expect(screen.getByText("Fuente actual: configuración personalizada.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restaurar permisos por defecto" }));
    expect(window.localStorage.getItem(PERMISSIONS_CUSTOM_STORAGE_KEY)).toBeNull();
    expect(screen.getByText("Fuente actual: valores por defecto.")).toBeTruthy();
  });

  it("names every permission control", () => {
    renderPage();
    expect(screen.getByRole("combobox", { name: "Alcance de datos" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Ver riesgo de proyecto" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Ver carga del equipo" })).toBeTruthy();
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
