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
import { ADMIN_TASK_TITLE, INICIO_ADMIN, INICIO_EMPTY, INICIO_NON_ADMIN, KPI_VALUES, VENCIDAS_HREF } from "./inicio-fixtures";
import { weekLabel } from "./WeeklyPaceChart";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
/** The styles that render the shared widget layout (Visual is `InicioVisual`, tested in InicioVisual.test.tsx). */
const SHARED_STYLES: PresentationStyle[] = ["esencial", "analitico"];
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

  it("reads the photo from me.profile and follows its updates", async () => {
    const { client } = renderInicio("analitico", INICIO_NON_ADMIN, {
      profile: { ...PROFILE, photoUrl: "/api/staff/s-1/photo?v=1" },
    });
    expect(screen.getByRole("button", { name: "Cambiar foto de perfil" })).toBeTruthy();
    await act(async () => {
      client.setQueryData<MyProfile>(qk.me.profile(), { ...PROFILE, photoUrl: null });
    });
    // Query observers are notified on the next tick.
    expect(await screen.findByRole("button", { name: "Subir foto de perfil" })).toBeTruthy();
  });
});

describe("InicioClient header block", () => {
  it("greets by hour and shows the role and the lowercase es-MX date line", () => {
    renderInicio("analitico");
    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana" })).toBeTruthy();
    expect(screen.getByText("Arquitecta de proyecto")).toBeTruthy();
    expect(screen.getByText(`viernes, 6 de noviembre · 2 eventos hoy · ${KPI_VALUES.vencidas} tareas vencidas`)).toBeTruthy();
  });

  it("links Nueva tarea to the new-task dialog of Tareas", () => {
    renderInicio("visual");
    expect(screen.getByRole("link", { name: "Nueva tarea" }).getAttribute("href")).toBe("/tareas?nueva=1");
  });

  it("shows the initials when there is no photo", () => {
    renderInicio("analitico");
    expect(screen.getByText("AL")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subir foto de perfil" })).toBeTruthy();
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
  const shared = [KPI_VALUES.proyectos_activos, KPI_VALUES.vencidas, KPI_VALUES.bloqueadas, KPI_VALUES.revisiones_7d];

  it.each(SHARED_STYLES)("renders the same KPI numbers in %s", (style) => {
    renderInicio(style);
    for (const value of shared) {
      expect(screen.getAllByText(String(value)).length).toBeGreaterThan(0);
    }
    for (const label of ["Proyectos activos", "Vencidas", "Bloqueadas", "Revisiones · 7 días"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("shows Completadas · semana only in Analítico", () => {
    for (const style of STYLES) {
      renderInicio(style);
      const label = screen.queryAllByText("Completadas · semana");
      const value = screen.queryAllByText(String(KPI_VALUES.completadas_semana));
      if (style === "analitico") {
        expect(label.length).toBeGreaterThan(0);
        expect(value.length).toBeGreaterThan(0);
      } else {
        expect(label).toHaveLength(0);
        expect(value).toHaveLength(0);
      }
      cleanup();
    }
  });
});

describe("InicioClient sections", () => {
  it.each(SHARED_STYLES)("titles every widget in %s", (style) => {
    renderInicio(style);
    for (const title of ["Tareas abiertas por tramo", "Requiere atención", "Mi día", "Avance de proyectos activos", "Carga por persona"]) {
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
    renderInicio("esencial");
    expect(screen.queryAllByText("Ritmo semanal")).toHaveLength(0);
  });
});

describe("InicioClient empty states", () => {
  it.each(SHARED_STYLES)("gives every widget an empty state in %s", (style) => {
    renderInicio(style, INICIO_EMPTY);
    expect(screen.getByText("Nada requiere atención hoy")).toBeTruthy();
    expect(screen.getByText("Aún no hay proyectos activos")).toBeTruthy();
    expect(screen.getByText("No hay tareas abiertas.")).toBeTruthy();
    expect(screen.getByText("Nadie tiene tareas abiertas.")).toBeTruthy();
    expect(screen.getByText("Sin revisiones en los próximos 7 días")).toBeTruthy();
    if (style !== "esencial") {
      expect(screen.getByText("Sin tareas creadas ni completadas en las últimas 8 semanas.")).toBeTruthy();
    }
  });

  it("counts zero events and zero overdue tasks in the date line", () => {
    renderInicio("analitico", INICIO_EMPTY);
    expect(screen.getByText("viernes, 6 de noviembre · 0 eventos hoy · 0 tareas vencidas")).toBeTruthy();
  });

  it("offers Nuevo proyecto when there are no projects", () => {
    renderInicio("analitico", INICIO_EMPTY);
    expect(screen.getByRole("link", { name: "Nuevo proyecto" }).getAttribute("href")).toBe("/proyectos");
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

/** The widget card titled `title`. */
const region = (title: string) => screen.getByRole("region", { name: title });

/** Body rows (rows with data cells) of the table inside a card. */
const dataRows = (title: string) =>
  within(region(title))
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("cell").length > 0);

const ATTENTION_TITLE = INICIO_NON_ADMIN.attention[0].title;
const PACE = INICIO_NON_ADMIN.weeklyPace;

describe("InicioClient KPI selection", () => {
  it("makes the KPIs toggle buttons; the same KPI again clears the selection", () => {
    renderInicio("esencial");
    const tile = screen.getByRole("button", { name: "Vencidas" });
    expect(tile.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tile);
    expect(screen.getByRole("button", { name: "Vencidas" }).getAttribute("aria-pressed")).toBe("true");
    expect(useInicioDashboard.getState().selectedKpi).toBe("vencidas");
    fireEvent.click(screen.getByRole("button", { name: "Vencidas" }));
    expect(screen.getByRole("button", { name: "Vencidas" }).getAttribute("aria-pressed")).toBe("false");
    expect(useInicioDashboard.getState().selectedKpi).toBeNull();
  });

  it("keeps the selected KPI's destination reachable as a link", () => {
    renderInicio("esencial");
    expect(screen.queryByRole("link", { name: /^Ver vencidas/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vencidas" }));
    expect(screen.getByRole("link", { name: /^Ver vencidas/ }).getAttribute("href")).toBe(VENCIDAS_HREF);
  });

  it("shows no selection for a KPI that is not in the data", () => {
    useInicioDashboard.setState({ selectedKpi: "vencidas" });
    renderInicio("esencial", INICIO_EMPTY);
    expect(screen.queryByRole("link", { name: /^Ver / })).toBeNull();
  });
});

describe("InicioClient range (Ritmo semanal)", () => {
  it("offers 4 / 8 / 12 semanas with 8 pressed by default", () => {
    renderInicio("analitico");
    const group = within(region("Ritmo semanal")).getByRole("group", { name: "Rango" });
    const pressed = within(group)
      .getAllByRole("button")
      .map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-pressed")]);
    expect(pressed).toEqual([
      ["4 semanas", "false"],
      ["8 semanas", "true"],
      ["12 semanas", "false"],
    ]);
    expect(dataRows("Ritmo semanal")).toHaveLength(8);
  });

  it("shows exactly the selected weeks in the Analítico table (seeded 4 weeks)", () => {
    useInicioDashboard.setState({ range: "4w" });
    renderInicio("analitico");
    const rows = dataRows("Ritmo semanal");
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain(weekLabel(PACE[PACE.length - 4].weekStart));
    expect(rows[3].textContent).toContain(weekLabel(PACE[PACE.length - 1].weekStart));
  });

  it("switches to 12 weeks from the control", () => {
    renderInicio("analitico");
    fireEvent.click(within(region("Ritmo semanal")).getByRole("button", { name: "12 semanas" }));
    expect(useInicioDashboard.getState().range).toBe("12w");
    expect(dataRows("Ritmo semanal")).toHaveLength(12);
  });
});

describe("InicioClient series toggles (Ritmo semanal)", () => {
  it("drops a hidden series from the table and keeps the other", () => {
    useInicioDashboard.setState({ hiddenSeries: { weeklyPace: ["created"] } });
    renderInicio("analitico");
    const card = within(region("Ritmo semanal"));
    expect(card.queryByRole("columnheader", { name: "Creadas" })).toBeNull();
    expect(card.getByRole("columnheader", { name: "Completadas" })).toBeTruthy();
  });

  it("toggles a series from the legend and never hides the last one", () => {
    renderInicio("analitico");
    const series = within(region("Ritmo semanal")).getByRole("group", { name: "Series" });
    fireEvent.click(within(series).getByRole("button", { name: /Creadas/ }));
    expect(useInicioDashboard.getState().hiddenSeries.weeklyPace).toEqual(["created"]);
    fireEvent.click(within(series).getByRole("button", { name: /Completadas/ }));
    expect(useInicioDashboard.getState().hiddenSeries.weeklyPace).toEqual(["created"]);
  });
});

describe("InicioClient collapse", () => {
  it.each(SHARED_STYLES)("gives every widget card a collapse toggle in %s", (style) => {
    renderInicio(style);
    const titles = ["Tareas abiertas por tramo", "Requiere atención", "Mi día", "Avance de proyectos activos", "Carga por persona"];
    if (style !== "esencial") titles.push("Ritmo semanal");
    for (const title of titles) {
      const toggle = within(region(title)).getByRole("button", { name: "Contraer" });
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("does not render a collapsed card's body (seeded) and expands it again", () => {
    useInicioDashboard.setState({ collapsed: { attention: true } });
    renderInicio("analitico");
    const toggle = within(region("Requiere atención")).getByRole("button", { name: "Expandir" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(ATTENTION_TITLE)).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getAllByText(ATTENTION_TITLE).length).toBeGreaterThan(0);
    expect(useInicioDashboard.getState().collapsed.attention).toBe(false);
  });

  it("collapses an empty widget card too", () => {
    useInicioDashboard.setState({ collapsed: { workload: true } });
    renderInicio("analitico", INICIO_EMPTY);
    expect(within(region("Carga por persona")).getByRole("button", { name: "Expandir" })).toBeTruthy();
    expect(screen.queryByText("Nadie tiene tareas abiertas.")).toBeNull();
  });
});

describe("InicioClient chart / table per style", () => {
  const TRAMO = "Tareas abiertas por tramo";

  it("renders each style's default without a pick", () => {
    renderInicio("esencial");
    expect(within(region(TRAMO)).queryAllByRole("columnheader")).toHaveLength(0);
    cleanup();
    renderInicio("analitico");
    expect(within(region(TRAMO)).getAllByRole("columnheader").length).toBeGreaterThan(0);
  });

  it("keeps a table pick in Esencial out of Analítico", () => {
    renderInicio("esencial");
    fireEvent.click(within(region(TRAMO)).getByRole("button", { name: "Ver como tabla" }));
    expect(useInicioDashboard.getState().views).toEqual({ esencial: { tramoDonut: "table" } });
    expect(within(region(TRAMO)).getAllByRole("columnheader").length).toBeGreaterThan(0);
    cleanup();

    renderInicio("analitico");
    expect(
      within(region(TRAMO)).getByRole("button", { name: "Ver como tabla" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows the Analítico workload table in Esencial when picked there (seeded)", () => {
    useInicioDashboard.setState({ views: { esencial: { workload: "table" } } });
    renderInicio("esencial");
    expect(within(region("Carga por persona")).getAllByRole("columnheader").length).toBeGreaterThan(0);
  });
});

describe("InicioClient dashboard state stays on the client", () => {
  it("calls no server action when the controls change", () => {
    renderInicio("analitico");
    fireEvent.click(screen.getByRole("button", { name: "Vencidas" }));
    fireEvent.click(within(region("Ritmo semanal")).getByRole("button", { name: "4 semanas" }));
    fireEvent.click(within(region("Ritmo semanal")).getByRole("button", { name: /Creadas/ }));
    fireEvent.click(within(region("Mi día")).getByRole("button", { name: "Contraer" }));
    fireEvent.click(within(region("Carga por persona")).getByRole("button", { name: "Ver como gráfica" }));
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
    expect(container.textContent).toContain(ATTENTION_TITLE);
    const scope = within(container);
    const paceRows = () =>
      within(scope.getByRole("region", { name: "Ritmo semanal" }))
        .getAllByRole("row")
        .filter((row) => within(row).queryAllByRole("cell").length > 0);
    expect(paceRows()).toHaveLength(8);

    // What `<UiStoresHydrator/>` does after mount.
    await act(async () => {
      await useInicioDashboard.persist.rehydrate();
    });
    expect(useInicioDashboard.getState().range).toBe("4w");
    expect(container.textContent).not.toContain(ATTENTION_TITLE);
    expect(paceRows()).toHaveLength(4);
    expect(
      within(scope.getByRole("region", { name: "Ritmo semanal" })).queryByRole("columnheader", { name: "Creadas" }),
    ).toBeNull();
  });
});
