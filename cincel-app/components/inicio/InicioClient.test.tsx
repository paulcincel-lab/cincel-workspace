// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

const actions = vi.hoisted(() => ({ getInicioPageData: vi.fn(), fetchMyProfileAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/inicio-actions", () => ({ getInicioPageData: actions.getInicioPageData }));
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: actions.fetchMyProfileAction }));

// The photo button writes me.profile in the query cache; these tests render it without one.
vi.mock("@/components/shell/photo-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shell/photo-upload")>()),
  usePhotoUploadMutation: () => ({ mutateAsync: async () => "" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));
// The charts load on demand behind Suspense, which renderToString can't wait for; their box stands in.
vi.mock("@/components/widgets/charts/lazy", () => ({
  LazyAreaSeriesChart: () => <div data-slot="chart-placeholder" />,
  LazyDonutChart: () => <div data-slot="chart-placeholder" />,
  loadAreaSeriesChart: async () => ({}),
  loadDonutChart: async () => ({}),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(async () => ({ preferences: {}, appearance: {} })),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { InicioPageData } from "@/lib/loaders/inicio";
import { qk } from "@/lib/query/keys";
import { inicioPageOptions } from "@/lib/query/options/inicio";
import { createTestQueryClient, hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import { dashboardStorageKey } from "@/lib/stores/dashboard-store";
import { useInicioDashboard } from "@/lib/stores/inicio-dashboard-store";
import type { InicioData, PresentationStyle } from "@/lib/types/redesign";
import type { MyProfile } from "@/lib/types/shell";

import { InicioClient } from "./InicioClient";
import { ADMIN_TASK_TITLE, INICIO_ADMIN, INICIO_EMPTY, INICIO_NON_ADMIN, KPI_VALUES } from "./inicio-fixtures";
import { weekLabel } from "./WeeklyPaceChart";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
/** Each style's section titles (frames Inicio-Visual, Inicio-Esencial, Inicio-Analitico). */
const SECTION_TITLES: Record<PresentationStyle, string[]> = {
  visual: ["Ritmo semanal", "Tareas por tramo", "Requiere atención", "Agenda de hoy", "Proyectos en curso"],
  esencial: ["Lo que vence esta semana", "Requiere atención", "Ritmo semanal", "Avance de proyectos"],
  analitico: ["Atención", "Ritmo semanal", "Carga por persona", "Tareas abiertas por tramo", "Agenda de hoy"],
};
/** Each style's empty copy with no data. */
const EMPTY_COPY: Record<PresentationStyle, string[]> = {
  visual: ["Todo al día", "No hay tareas abiertas.", "Sin eventos hoy", "No hay proyectos activos", "Sin tareas creadas ni completadas."],
  esencial: ["Nada vence esta semana", "Todo al día", "Sin movimiento en las últimas semanas", "No hay proyectos activos"],
  analitico: ["Todo al día", "Sin movimiento en el rango", "Sin tareas asignadas", "Sin tareas abiertas", "Sin eventos ni entregas hoy"],
};
// 09:00 on Friday 6 November 2026 in Mexico City.
const NOW = "2026-11-06T15:00:00Z";

const PROFILE: MyProfile = { id: "s-1", name: "Ana López", photoUrl: null };

function pageData(inicio: InicioData, showGoogleSetupBanner = false): InicioPageData {
  return { inicio, firstLogin: { showGoogleSetupBanner } };
}

const ui = (style: PresentationStyle) => (
  <StyleProvider style={style} scope="staff">
    <InicioClient me={{ firstName: "Ana", name: "Ana López", role: "Arquitecta de proyecto" }} now={NOW} />
  </StyleProvider>
);

/** Renders with `qk.inicio()` and `qk.me.profile()` in the cache, as after the page prefetch and the shell seed. */
function renderInicio(
  style: PresentationStyle,
  data: InicioData = INICIO_NON_ADMIN,
  options: { banner?: boolean; profile?: MyProfile; client?: QueryClient } = {},
) {
  const client = options.client ?? createTestQueryClient();
  client.setQueryData(qk.inicio(), pageData(data, options.banner));
  client.setQueryData(qk.me.profile(), options.profile ?? PROFILE);
  return renderWithQueryClient(ui(style), { client });
}

beforeEach(() => {
  actions.getInicioPageData.mockReset();
  actions.fetchMyProfileAction.mockReset();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("InicioClient query", () => {
  it("keys the page query qk.inicio() with a 30 s stale time and no input", async () => {
    const options = inicioPageOptions();
    expect(options.queryKey).toEqual(["inicio"]);
    expect(options.staleTime).toBe(30_000);
    actions.getInicioPageData.mockResolvedValue(pageData(INICIO_EMPTY));
    await createTestQueryClient().fetchQuery(options);
    expect(actions.getInicioPageData).toHaveBeenCalledWith({});
  });

  it("renders the hydrated data with no client action call on mount", async () => {
    const loader = vi.fn(async () => pageData(INICIO_NON_ADMIN));
    const { client, state } = await hydrationRoundtrip(async (server) => {
      await server.prefetchQuery({ queryKey: inicioPageOptions().queryKey, queryFn: loader });
    });
    // The shell seeds me.profile from the layout session.
    client.setQueryData(qk.me.profile(), PROFILE);
    renderWithQueryClient(ui("visual"), { client, hydrate: state });

    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana" })).toBeTruthy();
    await act(async () => {});
    expect(loader).toHaveBeenCalledTimes(1);
    expect(actions.getInicioPageData).not.toHaveBeenCalled();
    expect(actions.fetchMyProfileAction).not.toHaveBeenCalled();
  });

  it("shows the Google setup banner only when the page data asks for it", () => {
    renderInicio("visual");
    expect(screen.queryByText("Nadie puede entrar con Google todavía")).toBeNull();
    cleanup();
    renderInicio("visual", INICIO_NON_ADMIN, { banner: true });
    expect(screen.getByText("Nadie puede entrar con Google todavía")).toBeTruthy();
  });

  it.each(STYLES)("renders %s before the shell seeds me.profile", (style) => {
    actions.fetchMyProfileAction.mockReturnValue(new Promise(() => {}));
    const client = createTestQueryClient();
    client.setQueryData(qk.inicio(), pageData(INICIO_NON_ADMIN));
    renderWithQueryClient(ui(style), { client });
    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana" })).toBeTruthy();
  });
});

describe("InicioClient header block", () => {
  it.each(STYLES)("greets by hour with the es-MX date in the %s description", (style) => {
    renderInicio(style);
    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana" })).toBeTruthy();
    expect(screen.getByText(/^Viernes 6 de noviembre · /)).toBeTruthy();
  });

  it("follows the range in the Analítico description", () => {
    useInicioDashboard.setState({ range: "4w" });
    renderInicio("analitico");
    expect(screen.getByText("Viernes 6 de noviembre · resumen operativo de las últimas 4 semanas.")).toBeTruthy();
  });

  it("links Nueva tarea to the new-task dialog of Tareas", () => {
    renderInicio("visual");
    expect(screen.getByRole("link", { name: "Nueva tarea" }).getAttribute("href")).toBe("/tareas?nueva=1");
  });

  it("renders the Estilo switch, reachable by keyboard", () => {
    renderInicio("visual");
    const group = screen.getByRole("radiogroup", { name: /estilo/i });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent?.trim())).toEqual(expect.arrayContaining(["Visual", "Esencial", "Analítico"]));
    const focusable = radios.find((r) => r.tabIndex >= 0);
    expect(focusable).toBeTruthy();
    focusable?.focus();
    expect(document.activeElement).toBe(focusable);
  });
});

describe("InicioClient KPIs across styles", () => {
  it("renders the Analítico KPI strip from the page KPIs", () => {
    renderInicio("analitico");
    for (const value of [KPI_VALUES.proyectos_activos, KPI_VALUES.vencidas]) {
      expect(screen.getAllByText(String(value)).length).toBeGreaterThan(0);
    }
    for (const label of ["Proyectos activos", "Vencidas"]) {
      expect(screen.getAllByText(new RegExp(`^${label}$`, "i")).length).toBeGreaterThan(0);
    }
  });

  it("shows Completadas · semana only in Analítico", () => {
    renderInicio("visual");
    expect(screen.queryAllByText("Completadas · semana")).toHaveLength(0);
    expect(screen.queryAllByText(String(KPI_VALUES.completadas_semana))).toHaveLength(0);
    cleanup();
    renderInicio("analitico");
    expect(screen.getAllByText("Completadas (sem.)").length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(KPI_VALUES.completadas_semana)).length).toBeGreaterThan(0);
  });
});

describe("InicioClient sections", () => {
  it.each(STYLES)("titles every section of %s", (style) => {
    renderInicio(style);
    for (const title of SECTION_TITLES[style]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("shows Ritmo semanal in Visual and Analítico, not in Esencial", () => {
    renderInicio("visual");
    expect(screen.getAllByText("Ritmo semanal").length).toBeGreaterThan(0);
    cleanup();
    renderInicio("analitico");
    expect(screen.getAllByText("Ritmo semanal").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("columnheader", { name: "Neto" }).length).toBeGreaterThan(0);
    cleanup();
    // Esencial's Ritmo semanal is a soft card: a sentence and a small line, no table.
    renderInicio("esencial");
    expect(screen.queryAllByRole("columnheader", { name: "Neto" })).toHaveLength(0);
  });
});

describe("InicioClient empty states", () => {
  it.each(STYLES)("gives every section an empty state in %s", (style) => {
    renderInicio(style, INICIO_EMPTY);
    for (const copy of EMPTY_COPY[style]) {
      expect(screen.getAllByText(copy).length).toBeGreaterThan(0);
    }
  });

  it("says nothing needs attention in the Esencial description", () => {
    renderInicio("esencial", INICIO_EMPTY);
    expect(screen.getByText("Viernes 6 de noviembre · nada necesita tu atención hoy.")).toBeTruthy();
  });

  it.each(STYLES)("keeps Nueva tarea in the %s header with no data", (style) => {
    renderInicio(style, INICIO_EMPTY);
    expect(screen.getAllByRole("link", { name: "Nueva tarea" }).length).toBeGreaterThan(0);
  });
});

describe("InicioClient visibility (B8)", () => {
  it.each(STYLES)("a non-admin's Inicio shows no admin task and no client or origin field (%s)", (style) => {
    renderInicio(style, INICIO_NON_ADMIN);
    expect(screen.queryByText(ADMIN_TASK_TITLE)).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bCliente\b/);
    expect(text).not.toMatch(/\bOrigen\b/);
  });

  it("renders exactly what the server returns (an admin sees the admin task)", () => {
    renderInicio("visual", INICIO_ADMIN);
    expect(screen.getAllByText(ADMIN_TASK_TITLE).length).toBeGreaterThan(0);
  });
});

// ── Dashboard interactions (useInicioDashboard, zustand.md §2.5) ────────────
// Each style's own controls are covered in InicioVisual / InicioEsencial /
// InicioAnalitico tests; these check that the shared store reaches the layouts.

/** The section titled `title`. */
const region = (title: string) => screen.getByRole("region", { name: title });

/** Body rows of the table inside a section (no header, no tfoot). */
const dataRows = (title: string) => [...region(title).querySelectorAll("tbody tr")];

const ATTENTION_TITLE = INICIO_NON_ADMIN.attention[0].title;
const PACE = INICIO_NON_ADMIN.weeklyPace;

describe("InicioClient Visual links", () => {
  it("sends Ver vencidas to the overdue tasks", () => {
    renderInicio("visual");
    const links = screen.getAllByRole("link", { name: "Ver vencidas" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toBe("/tareas?mostrar=en_retraso");
  });
});

describe("InicioClient range (Analítico Ritmo semanal)", () => {
  it("offers 4 / 8 / 12 sem with 8 selected by default", () => {
    renderInicio("analitico");
    const group = screen.getByRole("radiogroup", { name: "Rango" });
    const checked = within(group)
      .getAllByRole("radio")
      .map((r) => [r.textContent?.trim(), r.getAttribute("aria-checked")]);
    expect(checked).toEqual([
      ["4 sem", "false"],
      ["8 sem", "true"],
      ["12 sem", "false"],
    ]);
    expect(dataRows("Ritmo semanal")).toHaveLength(Math.min(8, PACE.length));
  });

  it("shows exactly the selected weeks in the pace table (seeded 4 weeks)", () => {
    useInicioDashboard.setState({ range: "4w" });
    renderInicio("analitico");
    const rows = dataRows("Ritmo semanal");
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain(weekLabel(PACE[PACE.length - 4].weekStart));
    expect(rows[3].textContent).toContain(weekLabel(PACE[PACE.length - 1].weekStart));
  });

  it("switches to 12 weeks from the control", () => {
    renderInicio("analitico");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Rango" })).getByRole("radio", { name: /12 sem/ }));
    expect(useInicioDashboard.getState().range).toBe("12w");
    expect(dataRows("Ritmo semanal")).toHaveLength(Math.min(12, PACE.length));
  });
});

describe("InicioClient collapse (Analítico)", () => {
  it("gives every section a collapse toggle", () => {
    renderInicio("analitico");
    for (const title of SECTION_TITLES.analitico) {
      const toggle = region(title).querySelector("button[aria-expanded]");
      expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("does not render a collapsed section's body (seeded) and expands it again", () => {
    useInicioDashboard.setState({ collapsed: { attention: true } });
    renderInicio("analitico");
    const toggle = region("Atención").querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(ATTENTION_TITLE)).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getAllByText(ATTENTION_TITLE).length).toBeGreaterThan(0);
    expect(useInicioDashboard.getState().collapsed.attention).toBe(false);
  });

  it("collapses an empty section too", () => {
    useInicioDashboard.setState({ collapsed: { workload: true } });
    renderInicio("analitico", INICIO_EMPTY);
    expect(region("Carga por persona").querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Sin tareas asignadas")).toBeNull();
  });
});

describe("InicioClient dashboard state stays on the client", () => {
  it("calls no server action when the controls change", () => {
    renderInicio("analitico");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Rango" })).getByRole("radio", { name: /4 sem/ }));
    fireEvent.click(region("Agenda de hoy").querySelector<HTMLButtonElement>("button[aria-expanded]")!);
    fireEvent.click(screen.getAllByRole("button", { name: "Contraer todo" })[0]);
    expect(actions.getInicioPageData).not.toHaveBeenCalled();
    expect(actions.fetchMyProfileAction).not.toHaveBeenCalled();
  });
});

describe("InicioClient SSR and persisted choices", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  it("hydrates on the defaults with a persisted value present, then applies it after mount", async () => {
    localStorage.setItem(
      dashboardStorageKey("inicio"),
      JSON.stringify({
        state: { range: "4w", collapsed: { attention: true }, views: {}, hiddenSeries: { weeklyPace: ["created"] } },
        version: 1,
      }),
    );
    const client = createTestQueryClient();
    client.setQueryData(qk.inicio(), pageData(INICIO_NON_ADMIN));
    client.setQueryData(qk.me.profile(), PROFILE);
    const tree = <QueryClientProvider client={client}>{ui("analitico")}</QueryClientProvider>;

    const html = renderToString(tree);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydrat/i);
    consoleError.mockRestore();

    // First client render = server render = defaults.
    expect(container.textContent).toContain("resumen operativo de las últimas 8 semanas.");
    expect(useInicioDashboard.getState().range).toBe("8w");

    // What `<UiStoresHydrator/>` does after mount.
    await act(async () => {
      await useInicioDashboard.persist.rehydrate();
    });
    expect(useInicioDashboard.getState().range).toBe("4w");
    expect(container.textContent).toContain("resumen operativo de las últimas 4 semanas.");
    expect(useInicioDashboard.getState().collapsed.attention).toBe(true);
    expect(useInicioDashboard.getState().hiddenSeries.weeklyPace).toEqual(["created"]);
  });
});
