// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/components/shell/photo-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shell/photo-upload")>()),
  usePhotoUploadMutation: () => ({ mutateAsync: async () => "" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/page-data/inicio-actions", () => ({ getInicioPageData: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => []),
  fetchCatalogAssignableStaff: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchWorkflowsAction: vi.fn(async () => []),
  fetchTramosNavAction: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  createUserTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(async () => ({ preferences: {}, appearance: {} })),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_PRESETS } from "@/lib/ui/themes";
import type { InicioData } from "@/lib/types/redesign";

import { InicioClient } from "./InicioClient";
import { INICIO_EMPTY, INICIO_NON_ADMIN } from "./inicio-fixtures";

const MODES = ["light", "dark"] as const;

const DATA: InicioData = {
  ...INICIO_NON_ADMIN,
  projectsProgress: [
    { id: "p-1", label: "Casa Lomas", sublabel: "Diseño", real: 48, href: "/proyectos/p-1", atRisk: true },
    { id: "p-2", label: "Depto Roma", sublabel: "Construcción", real: 82, href: "/proyectos/p-2" },
  ],
};

/** Azul Cincel, the default theme, the way the root layout applies it. */
function applyTheme(mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", "azul");
  html.classList.toggle("dark", mode === "dark");
  const vars = Object.entries(THEME_PRESETS.azul.tokens)
    .map(([name, value]) => `--${name}: ${value[mode]};`)
    .join(" ");
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = `html:root[data-theme="${mode}"]{${vars}}`;
  document.head.appendChild(style);
}

async function seriousViolations() {
  const results = await axe.run(document.body, { resultTypes: ["violations"] });
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderEsencial(data: InicioData = DATA) {
  const client = createTestQueryClient();
  client.setQueryData(qk.inicio(), { inicio: data, firstLogin: { showGoogleSetupBanner: false } });
  client.setQueryData(qk.me.profile(), { id: "s-1", name: "Ana López", photoUrl: null });
  renderWithQueryClient(
    <StyleProvider style="esencial" scope="staff">
      <InicioClient me={{ firstName: "Ana", name: "Ana López", role: "Arquitecta" }} now="2026-11-06T15:00:00Z" />
    </StyleProvider>,
    { client },
  );
}

beforeEach(() => {
  applyTheme("light");
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

describe("Inicio Esencial accessibility", () => {
  it.each(MODES)("axe clean light and dark (%s)", async (mode) => {
    document.getElementById("appearance")?.remove();
    applyTheme(mode);
    renderEsencial();
    expect(await seriousViolations()).toEqual([]);
    cleanup();
    renderEsencial(INICIO_EMPTY);
    expect(await seriousViolations()).toEqual([]);
  });

  it("progressbar values", () => {
    renderEsencial();
    const bars = within(screen.getByRole("region", { name: "Avance de proyectos" })).getAllByRole("progressbar");
    expect(
      bars.map((b) => [
        b.getAttribute("aria-label"),
        b.getAttribute("aria-valuenow"),
        b.getAttribute("aria-valuemin"),
        b.getAttribute("aria-valuemax"),
      ]),
    ).toEqual([
      ["Depto Roma: 82 %", "82", "0", "100"],
      ["Casa Lomas: 48 %", "48", "0", "100"],
    ]);
  });

  it("one tab stop per row", () => {
    renderEsencial();
    const week = screen.getByRole("region", { name: "Lo que vence esta semana" });
    for (const row of within(week).getAllByRole("listitem")) {
      const stops = row.querySelectorAll("a[href], button:not([disabled]), input, [tabindex]:not([tabindex='-1'])");
      expect(stops.length).toBeLessThanOrEqual(1);
    }
    const attention = screen.getByRole("region", { name: "Requiere atención" });
    for (const row of within(attention).getAllByRole("listitem")) {
      expect(row.querySelectorAll("a[href], button:not([disabled])")).toHaveLength(1);
    }
  });

  it("hides the Ritmo line from assistive tech; the sentence carries the meaning", () => {
    renderEsencial();
    const pace = screen.getByRole("region", { name: "Ritmo semanal" });
    for (const svg of pace.querySelectorAll("svg")) expect(svg.closest("[aria-hidden='true']")).toBeTruthy();
    expect(within(pace).getByText(/entraron/)).toBeTruthy();
  });
});
