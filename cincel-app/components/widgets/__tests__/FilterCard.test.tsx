// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";

import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import { filterCardFixture } from "@/components/widgets/fixtures/grouped-table";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

async function seriousViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id);
}

/** Keeps the selected values like a page would (URL sync is the caller's job). */
function Controlled({ onChange }: { onChange(groupId: string, value: string): void }) {
  const [groups, setGroups] = useState<FilterGroup[]>(filterCardFixture);
  return (
    <FilterCard
      groups={groups}
      onChange={(groupId, value) => {
        onChange(groupId, value);
        setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, value } : g)));
      }}
    />
  );
}

describe("FilterCard", () => {
  it("renders square segments with counts", () => {
    const { container } = render(<FilterCard groups={filterCardFixture} onChange={() => {}} />);
    expect(screen.getByRole("region", { name: "Filtros" })).toBeTruthy();
    const estado = screen.getByRole("radiogroup", { name: "Estado" });
    const radios = within(estado).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio.className).not.toContain("rounded-full");
    const todas = within(estado).getByRole("radio", { name: /Todas/ });
    expect(todas.getAttribute("aria-checked")).toBe("true");
    expect(todas.className).toContain("bg-primary");
    const vencidas = within(estado).getByRole("radio", { name: /Vencidas/ });
    expect(within(vencidas).getByText("7").className).toContain("text-destructive");
    expect(within(todas).getByText("28").className).toContain("text-primary-foreground");
    expect(within(todas).getByText("28").className).toContain("font-mono");
    expect(container.querySelectorAll('[data-slot="filter-swatch"]')).toHaveLength(2);
  });

  it("arrow keys move and select", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const estado = screen.getByRole("radiogroup", { name: "Estado" });
    const tabStops = within(estado)
      .getAllByRole("radio")
      .filter((radio) => radio.getAttribute("tabindex") === "0");
    expect(tabStops).toHaveLength(1);
    const todas = within(estado).getByRole("radio", { name: /Todas/ });
    fireEvent.keyDown(todas, { key: "ArrowRight" });
    const vencidas = within(estado).getByRole("radio", { name: /Vencidas/ });
    expect(onChange).toHaveBeenLastCalledWith("estado", "vencidas");
    expect(document.activeElement).toBe(vencidas);
    expect(vencidas.getAttribute("aria-checked")).toBe("true");
    expect(vencidas.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(vencidas, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("estado", "semana");
    fireEvent.keyDown(within(estado).getByRole("radio", { name: /Esta semana/ }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("estado", "todas");
    fireEvent.keyDown(within(estado).getByRole("radio", { name: /Todas/ }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("estado", "semana");
    fireEvent.keyDown(within(estado).getByRole("radio", { name: /Esta semana/ }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("estado", "todas");
  });

  it("onChange gets group id and value", () => {
    const onChange = vi.fn();
    render(<FilterCard groups={filterCardFixture} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Construcción" }));
    expect(onChange).toHaveBeenCalledWith("etapa", "construccion");
    onChange.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: "Todos" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("search input calls onChange", () => {
    const onSearch = vi.fn();
    render(
      <FilterCard
        groups={filterCardFixture}
        onChange={() => {}}
        search={{ value: "", onChange: onSearch, placeholder: "Buscar…", label: "Buscar tareas" }}
        extra={<span>Responsable</span>}
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Buscar tareas" });
    fireEvent.change(input, { target: { value: "planos" } });
    expect(onSearch).toHaveBeenCalledWith("planos");
    expect(screen.getByText("Responsable")).toBeTruthy();
  });

  it.each(["light", "dark"] as const)("has no serious or critical axe violations (%s)", async (mode) => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    const { container } = render(
      <main lang="es">
        <FilterCard
          groups={filterCardFixture}
          onChange={() => {}}
          search={{ value: "", onChange: () => {}, placeholder: "Buscar…", label: "Buscar tareas" }}
        />
      </main>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });
});
