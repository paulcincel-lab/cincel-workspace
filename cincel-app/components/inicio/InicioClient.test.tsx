// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

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
import type { InicioData, PresentationStyle } from "@/lib/types/redesign";
import type { MyProfile } from "@/lib/types/shell";

import { InicioClient } from "./InicioClient";
import { ADMIN_TASK_TITLE, INICIO_ADMIN, INICIO_EMPTY, INICIO_NON_ADMIN, KPI_VALUES } from "./inicio-fixtures";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
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
    const { client } = renderInicio("visual", INICIO_NON_ADMIN, {
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
    renderInicio("visual");
    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana" })).toBeTruthy();
    expect(screen.getByText("Arquitecta de proyecto")).toBeTruthy();
    expect(screen.getByText(`viernes, 6 de noviembre · 2 eventos hoy · ${KPI_VALUES.vencidas} tareas vencidas`)).toBeTruthy();
  });

  it("links Nueva tarea to the new-task dialog of Tareas", () => {
    renderInicio("visual");
    expect(screen.getByRole("link", { name: "Nueva tarea" }).getAttribute("href")).toBe("/tareas?nueva=1");
  });

  it("shows the initials when there is no photo", () => {
    renderInicio("visual");
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

  it.each(STYLES)("renders the same KPI numbers in %s", (style) => {
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
  it.each(STYLES)("titles every widget in %s", (style) => {
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
  it.each(STYLES)("gives every widget an empty state in %s", (style) => {
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
    renderInicio("visual", INICIO_EMPTY);
    expect(screen.getByText("viernes, 6 de noviembre · 0 eventos hoy · 0 tareas vencidas")).toBeTruthy();
  });

  it("offers Nuevo proyecto when there are no projects", () => {
    renderInicio("visual", INICIO_EMPTY);
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
