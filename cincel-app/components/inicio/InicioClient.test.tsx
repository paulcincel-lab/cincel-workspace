// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

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
import type { InicioData, PresentationStyle } from "@/lib/types/redesign";

import { InicioClient } from "./InicioClient";
import { ADMIN_TASK_TITLE, INICIO_ADMIN, INICIO_EMPTY, INICIO_NON_ADMIN, KPI_VALUES } from "./inicio-fixtures";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
// 09:00 on Friday 6 November 2026 in Mexico City.
const NOW = "2026-11-06T15:00:00Z";

function renderInicio(style: PresentationStyle, data: InicioData = INICIO_NON_ADMIN) {
  return render(
    <StyleProvider style={style} scope="staff">
      <InicioClient
        data={data}
        photoUrl={null}
        me={{ firstName: "Ana", name: "Ana López", role: "Arquitecta de proyecto" }}
        now={NOW}
      />
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
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
