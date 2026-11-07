// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";
import { THEME_IDS } from "@/lib/ui/themes";

const actions = vi.hoisted(() => ({
  createGroupMappingAction: vi.fn(),
  updateGroupMappingAction: vi.fn(),
  deleteGroupMappingAction: vi.fn(),
  ensureMissingProjectFoldersAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/lib/actions/workspace-access-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { GoogleGroupMappings } from "@/components/configuracion/GoogleGroupMappings";
import { GoogleHealthStatus } from "@/components/configuracion/GoogleHealthStatus";
import { ProjectFoldersBackfill } from "@/components/configuracion/ProjectFoldersBackfill";

import { GoogleSettings } from "./GoogleSettings";

const HEALTH: GoogleHealth = {
  workspaceDomain: "cincel.mx",
  oauthClientConfigured: true,
  groupMappingCount: 1,
  roleGroupMappingCount: 1,
  serviceAccountEmail: "cincel@proyecto.iam.gserviceaccount.com",
  sharedDriveId: "0AbCdEf",
  tokenKeyConfigured: true,
  lastDirectoryError: null,
  lastDriveError: null,
  googleLinkedStaff: 4,
  activeStaff: 9,
};

const MAPPING: GroupMapping = {
  id: "00000000-0000-4000-8000-0000000000a1",
  groupEmail: "cincel-direccion@example.test",
  kind: "role",
  role: "Dirección",
  positionId: null,
  positionName: null,
  rank: 70,
};

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("Ajustes › Google", () => {
  it("renders Estado, Grupos de Google and Carpetas de proyectos as settings sections, one heading each", () => {
    render(<GoogleSettings mappings={[MAPPING]} positions={[]} health={HEALTH} />);

    expect(screen.getByText("Los roles y las áreas se administran en grupos de Google Workspace.")).toBeTruthy();

    const estado = screen.getByRole("region", { name: "Estado" });
    expect(within(estado).getByText("cincel.mx")).toBeTruthy();
    expect(within(estado).getByText("4 de 9 colaboradores activos ya entraron con Google")).toBeTruthy();

    const grupos = screen.getByRole("region", { name: "Grupos de Google" });
    expect(within(grupos).getByText("cincel-direccion@example.test")).toBeTruthy();
    expect(within(grupos).getByRole("button", { name: "Agregar grupo" })).toBeTruthy();

    const carpetas = screen.getByRole("region", { name: "Carpetas de proyectos" });
    expect(within(carpetas).getByRole("button", { name: "Crear carpetas faltantes" })).toBeTruthy();

    // The bare components leave the headings to the sections: no duplicates.
    for (const name of ["Estado", "Grupos de Google", "Carpetas de proyectos"]) {
      expect(screen.getAllByRole("heading", { name })).toHaveLength(1);
    }
  });

  it("keeps the Estado error state when the health could not be loaded", () => {
    render(<GoogleSettings mappings={[]} positions={[]} health={null} />);
    const estado = screen.getByRole("region", { name: "Estado" });
    expect(within(estado).getByText("No se pudo cargar el estado de Google.")).toBeTruthy();
    // Health unknown: the backfill button stays enabled, as before.
    const button = within(screen.getByRole("region", { name: "Carpetas de proyectos" })).getByRole("button", {
      name: "Crear carpetas faltantes",
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables the backfill without a Shared Drive", () => {
    render(<GoogleSettings mappings={[]} positions={[]} health={{ ...HEALTH, sharedDriveId: null }} />);
    const button = within(screen.getByRole("region", { name: "Carpetas de proyectos" })).getByRole("button", {
      name: "Crear carpetas faltantes",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("runs the same backfill action as before", async () => {
    actions.ensureMissingProjectFoldersAction.mockResolvedValue({ created: 2, skipped: 0, failed: 0 });
    render(<GoogleSettings mappings={[]} positions={[]} health={HEALTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear carpetas faltantes" }));
    await waitFor(() => expect(screen.getByText("2 creadas")).toBeTruthy());
    expect(actions.ensureMissingProjectFoldersAction).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("opens the same group sheet from Agregar grupo", async () => {
    render(<GoogleSettings mappings={[]} positions={[]} health={HEALTH} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar grupo" }));
    await waitFor(() => expect(screen.getByText("El grupo se busca en Google Workspace al guardar.")).toBeTruthy());
  });

  it("has no serious axe violations in any theme, light and dark", async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        applyTheme(theme, mode);
        const { container, unmount } = render(
          <GoogleSettings mappings={[MAPPING]} positions={[]} health={HEALTH} />,
        );
        expect(await seriousViolations(container)).toEqual([]);
        unmount();
      }
    }
  });
});

describe("legacy Configuración → Google cards", () => {
  it("keep their own card heading when not bare", () => {
    render(
      <>
        <GoogleHealthStatus health={HEALTH} />
        <GoogleGroupMappings mappings={[]} positions={[]} />
        <ProjectFoldersBackfill />
      </>,
    );
    for (const name of ["Estado", "Grupos de Google", "Carpetas de proyectos"]) {
      expect(screen.getByRole("heading", { name, level: 2 })).toBeTruthy();
    }
  });
});
