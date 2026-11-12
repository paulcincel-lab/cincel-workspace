// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/calendario",
  useSearchParams: () => new URLSearchParams(""),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { DEFAULT_CALENDARIO_FILTERS } from "@/lib/calendario/url-state";
import type { CalendarioFilters as Filters } from "@/lib/types/calendario";
import type { WorkflowRef } from "@/lib/types/core";
import { settle } from "@/tests/helpers/settle";

import { CalendarioFilters } from "./CalendarioFilters";
import type { CalendarioFiltersProps } from "./calendario-filters-model";

const P1 = "11111111-1111-4111-8111-111111111111";
const TRAMOS: WorkflowRef[] = [
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
];
const PROJECTS = [
  { id: P1, name: "Madrid 22" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Roma 10" },
];

type Style = "visual" | "esencial" | "analitico";

function setup(style: Style, props: Partial<Omit<CalendarioFiltersProps, "filters">> & { filters?: Partial<Filters> } = {}) {
  const onChange = vi.fn();
  const { filters, ...rest } = props;
  const utils = render(
    <StyleProvider style={style} scope="staff">
      <CalendarioFilters
        filters={{ ...DEFAULT_CALENDARIO_FILTERS, ...filters }}
        vista="mes"
        canViewTeam
        projects={PROJECTS}
        tramos={TRAMOS}
        onChange={onChange}
        {...rest}
      />
    </StyleProvider>,
  );
  return { ...utils, onChange };
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-style");
});

describe("Visual filters", () => {
  it("shows Mostrar, Responsable, Proyecto, Ocultar completadas, the legend and the Mes hint", () => {
    const { onChange } = setup("visual");
    const mostrar = screen.getByRole("group", { name: "Mostrar" });
    fireEvent.click(within(mostrar).getByRole("button", { name: "Reuniones" }));
    expect(onChange).toHaveBeenCalledWith({ mostrar: "reuniones" });
    fireEvent.click(within(screen.getByRole("group", { name: "Responsable" })).getByRole("button", { name: "Todos" }));
    expect(onChange).toHaveBeenCalledWith({ quien: "todos" });
    expect(screen.getByRole("button", { name: "Proyecto: Todos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ ocultarCompletadas: true });
    const legend = screen.getByRole("list", { name: "Leyenda" });
    for (const text of ["Presale", "Diseño", "Reunión (con hora)", "Vencida"]) expect(within(legend).getByText(text)).toBeTruthy();
    expect(screen.getByText("Clic en un número de día para abrir ese día")).toBeTruthy();
  });

  it("hides the Mes hint in other vistas and Todos without the team permission", () => {
    setup("visual", { vista: "semana", canViewTeam: false });
    expect(screen.queryByText("Clic en un número de día para abrir ese día")).toBeNull();
    expect(within(screen.getByRole("group", { name: "Responsable" })).queryByRole("button", { name: "Todos" })).toBeNull();
  });
});

describe("Esencial filters", () => {
  it("shows the pills and the checkbox, with no project filter", () => {
    const { onChange } = setup("esencial");
    expect(screen.queryByRole("button", { name: /^Proyecto/ })).toBeNull();
    const pills = screen.getByRole("group", { name: "Responsable" });
    expect(within(pills).getByRole("button", { name: "Mi agenda" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(pills).getByRole("button", { name: "Todo el equipo" }));
    expect(onChange).toHaveBeenCalledWith({ quien: "todos" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ocultar completadas" }));
    expect(onChange).toHaveBeenCalledWith({ ocultarCompletadas: true });
  });

  it("hides Todo el equipo without the team permission", () => {
    setup("esencial", { canViewTeam: false });
    expect(screen.queryByRole("button", { name: "Todo el equipo" })).toBeNull();
  });

  it("shows a project set by the URL as a removable chip", () => {
    const { onChange } = setup("esencial", { filters: { proyectos: [P1] } });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Madrid 22" }));
    expect(onChange).toHaveBeenCalledWith({ proyectos: [] });
  });
});

describe("Analítico filters", () => {
  it("renders the FilterCard groups, Proyecto and Incluir apoyo", () => {
    const { onChange } = setup("analitico");
    expect(screen.getByRole("radiogroup", { name: "Mostrar" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Mostrar" })).getByRole("radio", { name: "Tareas" }));
    expect(onChange).toHaveBeenCalledWith({ mostrar: "tareas" });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Responsable" })).getByRole("radio", { name: "Todos" }));
    expect(onChange).toHaveBeenCalledWith({ quien: "todos" });
    const tramo = screen.getByRole("radiogroup", { name: "Tramo" });
    fireEvent.click(within(tramo).getByRole("radio", { name: "Diseño" }));
    expect(onChange).toHaveBeenCalledWith({ tramo: "w2" });
    fireEvent.click(within(tramo).getByRole("radio", { name: "Sin tramo" }));
    expect(onChange).toHaveBeenCalledWith({ tramo: "none" });
    expect(screen.getByRole("button", { name: "Proyecto: Todos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Incluir apoyo" }));
    expect(onChange).toHaveBeenCalledWith({ apoyo: false });
  });

  it("leaves Todos out of RESPONSABLE without the team permission", () => {
    setup("analitico", { canViewTeam: false });
    expect(within(screen.getByRole("radiogroup", { name: "Responsable" })).queryByRole("radio", { name: "Todos" })).toBeNull();
  });
});

describe("accessibility", () => {
  for (const style of ["visual", "esencial", "analitico"] as const) {
    for (const mode of ["light", "dark"] as const) {
      it(`axe clean: ${style}, ${mode}`, async () => {
        document.documentElement.setAttribute("data-theme", mode);
        document.documentElement.setAttribute("data-style", style);
        const { container } = setup(style);
        await act(async () => {});
        await settle();
        const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
        expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
      });
    }
  }
});
