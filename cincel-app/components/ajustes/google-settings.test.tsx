// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import axe from "axe-core";
import type { ReactElement } from "react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";
import { THEME_IDS } from "@/lib/ui/themes";

const actions = vi.hoisted(() => ({
  createGroupMappingAction: vi.fn(),
  updateGroupMappingAction: vi.fn(),
  deleteGroupMappingAction: vi.fn(),
  ensureMissingProjectFoldersAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const pageData = vi.hoisted(() => ({ getAjustesGooglePageData: vi.fn() }));

vi.mock("@/lib/actions/workspace-access-actions", () => actions);
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { GoogleGroupMappings } from "@/components/configuracion/GoogleGroupMappings";
import { GoogleHealthStatus, pendingStaffText } from "@/components/configuracion/GoogleHealthStatus";
import { ProjectFoldersBackfill } from "@/components/configuracion/ProjectFoldersBackfill";

import { GoogleSettings } from "./GoogleSettings";

const HEALTH: GoogleHealth = {
  workspaceDomain: "cincel.mx",
  oauthClientConfigured: true,
  groupMappingCount: 1,
  roleGroupMappingCount: 1,
  serviceAccountEmail: "cincel@proyecto.iam.gserviceaccount.com",
  sharedDriveId: "0AJk3abcdefghijUk9PVA",
  tokenKeyConfigured: true,
  lastDirectoryError: null,
  lastDriveError: null,
  googleLinkedStaff: 11,
  activeStaff: 14,
  pendingGoogleStaff: [
    { id: "s1", name: "Jorge Mena" },
    { id: "s2", name: "Sofía León" },
    { id: "s3", name: "Raúl Ortega" },
  ],
  projectsWithoutFolder: 3,
  projectsWithFolder: 21,
};

const MAPPING: GroupMapping = {
  id: "00000000-0000-4000-8000-0000000000a1",
  groupEmail: "cincel-direccion@example.test",
  kind: "role",
  role: "Dirección",
  positionId: null,
  positionName: null,
  rank: 70,
  memberCount: 12,
  exists: true,
};

const SENTENCE = "11 de 14 colaboradores activos ya entraron con Google";

type GooglePage = { mappings: GroupMapping[]; positions: { id: string; name: string }[]; health: GoogleHealth | null };

let client: QueryClient;

function render(ui: ReactElement) {
  return renderWithQueryClient(ui, { client });
}

/** Ajustes › Google as the page hydrates it: `qk.ajustes.page('google')` seeded, no fetch on mount. */
function renderSettings(page: GooglePage) {
  client.setQueryData(qk.ajustes.page("google"), page);
  return render(<GoogleSettings />);
}

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

const region = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  vi.clearAllMocks();
  client = createTestQueryClient();
});

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("Ajustes › Google", () => {
  it("renders the admin heading and the four sections of the frame, one heading each", () => {
    renderSettings({ mappings: [MAPPING], positions: [], health: HEALTH });

    expect(screen.getByRole("heading", { name: /^Google/ })).toBeTruthy();
    expect(screen.getByText(/Los roles y las áreas se administran en grupos de Google Workspace\./)).toBeTruthy();
    for (const name of ["Acceso con Google", "Estado", "Grupos de Google", "Carpetas de proyectos"]) {
      expect(screen.getAllByRole("heading", { name })).toHaveLength(1);
    }
    expect(within(region("Estado")).getByText("cincel.mx")).toBeTruthy();
    expect(within(region("Grupos de Google")).getByText(MAPPING.groupEmail)).toBeTruthy();
  });

  it("ring label reads the progress sentence", () => {
    renderSettings({ mappings: [MAPPING], positions: [], health: HEALTH });
    const acceso = region("Acceso con Google");
    expect(within(acceso).getByRole("img", { name: SENTENCE })).toBeTruthy();
    expect(within(acceso).getByText("79 %")).toBeTruthy();
    expect(within(acceso).getByText(SENTENCE)).toBeTruthy();
    expect(within(acceso).getByRole("link", { name: "Primeros pasos →" }).getAttribute("href")).toBe(
      "/ajustes/google/primeros-pasos",
    );
  });

  it("lists pending people, truncates after 5", () => {
    renderSettings({ mappings: [MAPPING], positions: [], health: HEALTH });
    expect(within(region("Acceso con Google")).getByText("Faltan: Jorge Mena, Sofía León, Raúl Ortega.")).toBeTruthy();

    const many = ["Ana", "Beto", "Carla", "Diego", "Elena", "Fer", "Gabi"].map((name, i) => ({ id: `p${i}`, name }));
    expect(pendingStaffText(many)).toBe("Faltan: Ana, Beto, Carla, Diego, Elena y 2 más.");
    expect(pendingStaffText([])).toBeNull();
    cleanup();
    renderSettings({ mappings: [MAPPING], positions: [], health: { ...HEALTH, pendingGoogleStaff: many, activeStaff: 18 } });
    expect(within(region("Acceso con Google")).getByText("Faltan: Ana, Beto, Carla, Diego, Elena y 2 más.")).toBeTruthy();
  });

  it("hides the missing people at 100 %", () => {
    renderSettings({
      mappings: [MAPPING],
      positions: [],
      health: { ...HEALTH, googleLinkedStaff: 14, pendingGoogleStaff: [] },
    });
    expect(within(region("Acceso con Google")).getByText("100 %")).toBeTruthy();
    expect(within(region("Acceso con Google")).queryByText(/^Faltan:/)).toBeNull();
  });

  it("missing group shows El grupo no existe", () => {
    const missing: GroupMapping = { ...MAPPING, id: "m-2", groupEmail: "externos@cincel.mx", memberCount: null, exists: false };
    const unchecked: GroupMapping = { ...MAPPING, id: "m-3", groupEmail: "nuevo@cincel.mx", memberCount: null, exists: null };
    renderSettings({ mappings: [MAPPING, missing, unchecked], positions: [], health: HEALTH });

    const row = (email: string) => within(screen.getByRole("rowheader", { name: email }).closest("tr") as HTMLElement);
    expect(row(MAPPING.groupEmail).getByText("12")).toBeTruthy();
    expect(row(MAPPING.groupEmail).getByText("Dirección")).toBeTruthy();
    expect(row("externos@cincel.mx").getByText("El grupo no existe").className).toContain("text-destructive");
    expect(row("nuevo@cincel.mx").getAllByText("—").length).toBeGreaterThan(0);
    expect(row(MAPPING.groupEmail).getByRole("button", { name: `Editar ${MAPPING.groupEmail}` })).toBeTruthy();
    expect(within(region("Grupos de Google")).getByText("El grupo se busca en Google Workspace al guardar.")).toBeTruthy();
  });

  it("shows each Estado row with its pill; the token key never shows", () => {
    renderSettings({
      mappings: [MAPPING],
      positions: [],
      health: {
        ...HEALTH,
        serviceAccountEmail: null,
        lastDirectoryError: {
          at: "2026-11-07T18:00:00.000Z",
          source: "group_mapping",
          kind: "http",
          status: 403,
          message: "El Directorio de Google respondió 403",
        },
      },
    });
    const estado = region("Estado");
    expect(within(estado).getByText("••••••••")).toBeTruthy();
    expect(within(estado).getByText("0AJk3…Uk9PVA")).toBeTruthy();
    expect(within(estado).getByText("Falta")).toBeTruthy();
    expect(within(estado).getByText("Error")).toBeTruthy();
    expect(within(estado).getByText("Sin errores")).toBeTruthy();
    expect(within(estado).getByText(/^7 nov · El Directorio de Google respondió 403/)).toBeTruthy();
  });

  it("not configured: the setup banner replaces the ring, Estado says Falta and the groups table is empty", () => {
    renderSettings({
      mappings: [],
      positions: [],
      health: { ...HEALTH, oauthClientConfigured: false, groupMappingCount: 0, roleGroupMappingCount: 0 },
    });
    const acceso = region("Acceso con Google");
    expect(within(acceso).queryByRole("img")).toBeNull();
    expect(within(acceso).getByText("Nadie puede entrar con Google todavía")).toBeTruthy();
    expect(within(region("Estado")).getAllByText("Falta").length).toBeGreaterThan(0);
    expect(within(region("Grupos de Google")).getByText("Aún no hay grupos.")).toBeTruthy();
  });

  it("keeps the error state when the health could not be loaded", () => {
    renderSettings({ mappings: [], positions: [], health: null });
    expect(within(region("Estado")).getByText("No se pudo cargar el estado de Google.")).toBeTruthy();
    // Health unknown: the backfill button stays enabled, as before.
    const button = within(region("Carpetas de proyectos")).getByRole("button", { name: "Crear carpetas faltantes" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("counts the projects with and without a folder; the backfill is disabled at 0 or without a Shared Drive", () => {
    renderSettings({ mappings: [], positions: [], health: HEALTH });
    const carpetas = region("Carpetas de proyectos");
    expect(carpetas.textContent).toContain("3 proyectos sin carpeta · 21 con carpeta en la unidad compartida");
    expect((within(carpetas).getByRole("button", { name: "Crear carpetas faltantes" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();

    renderSettings({ mappings: [], positions: [], health: { ...HEALTH, projectsWithoutFolder: 0 } });
    expect((within(region("Carpetas de proyectos")).getByRole("button", { name: "Crear carpetas faltantes" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    renderSettings({ mappings: [], positions: [], health: { ...HEALTH, sharedDriveId: null } });
    expect((within(region("Carpetas de proyectos")).getByRole("button", { name: "Crear carpetas faltantes" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("runs the same backfill action as before", async () => {
    actions.ensureMissingProjectFoldersAction.mockResolvedValue({ created: 2, skipped: 0, failed: 0 });
    renderSettings({ mappings: [], positions: [], health: HEALTH });
    fireEvent.click(screen.getByRole("button", { name: "Crear carpetas faltantes" }));
    await waitFor(() => expect(screen.getByText("2 creadas")).toBeTruthy());
    expect(actions.ensureMissingProjectFoldersAction).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("makes no client call on mount: the page data is hydrated", () => {
    renderSettings({ mappings: [MAPPING], positions: [], health: HEALTH });
    expect(screen.getByText("cincel-direccion@example.test")).toBeTruthy();
    expect(pageData.getAjustesGooglePageData).not.toHaveBeenCalled();
  });

  it("deleting a mapping from its sheet invalidates Google, Puestos and the staff catalog; no refresh", async () => {
    actions.deleteGroupMappingAction.mockResolvedValue({ ok: true });
    pageData.getAjustesGooglePageData.mockResolvedValue({ mappings: [], positions: [], health: HEALTH });
    renderSettings({ mappings: [MAPPING], positions: [], health: HEALTH });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: `Editar ${MAPPING.groupEmail}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar grupo" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(actions.deleteGroupMappingAction).toHaveBeenCalledWith(MAPPING.id));
    await waitFor(() => expect(screen.getByText("Aún no hay grupos.")).toBeTruthy());
    for (const queryKey of [qk.ajustes.page("google"), qk.ajustes.page("puestos"), qk.catalog.staff()]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
    expect(pageData.getAjustesGooglePageData).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("opens the same group sheet from Agregar grupo", async () => {
    renderSettings({ mappings: [MAPPING], positions: [], health: HEALTH });
    fireEvent.click(within(region("Grupos de Google")).getByRole("button", { name: "Agregar grupo" }));
    expect(await screen.findByRole("heading", { name: "Agregar grupo" })).toBeTruthy();
  });

  it("has no serious axe violations in any theme, light and dark", async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        applyTheme(theme, mode);
        const { container, unmount } = renderSettings({ mappings: [MAPPING], positions: [], health: HEALTH });
        expect(await seriousViolations(container)).toEqual([]);
        unmount();
      }
    }
  });
});

describe("legacy Configuración → Google cards", () => {
  it("keep their own card heading outside Ajustes", () => {
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
