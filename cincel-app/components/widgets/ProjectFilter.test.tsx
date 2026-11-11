// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProjectFilter,
  projectFilterCounts,
  projectFilterOptions,
  projectFilterSummary,
  type ProjectFilterOption,
} from "./ProjectFilter";

const OPTIONS: ProjectFilterOption[] = [
  { id: "p2", name: "Depto Roma", open: 4, overdue: 0 },
  { id: "p1", name: "Casa Lomas", open: 12, overdue: 3 },
  { id: "p3", name: "Árbol Norte", open: 1, overdue: 1 },
];

afterEach(cleanup);

function renderFilter(selected: string[] = [], onChange = vi.fn()) {
  const utils = render(<ProjectFilter options={OPTIONS} selected={selected} onChange={onChange} showLabel />);
  return { ...utils, onChange };
}

async function open() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Proyecto:/ }));
  });
}

describe("ProjectFilter helpers", () => {
  it("sorts by name (es) and searches without accents or case", () => {
    expect(projectFilterOptions(OPTIONS, "").map((o) => o.name)).toEqual(["Árbol Norte", "Casa Lomas", "Depto Roma"]);
    expect(projectFilterOptions(OPTIONS, "arbol").map((o) => o.id)).toEqual(["p3"]);
    expect(projectFilterOptions(OPTIONS, " ROMA ").map((o) => o.id)).toEqual(["p2"]);
  });

  it("summarises the selection", () => {
    expect(projectFilterSummary(OPTIONS, [])).toBe("Todos");
    expect(projectFilterSummary(OPTIONS, ["p1"])).toBe("Casa Lomas");
    expect(projectFilterSummary(OPTIONS, ["p1", "p2"])).toBe("2 proyectos");
  });

  it("names the open and overdue counts", () => {
    expect(projectFilterCounts(OPTIONS[1])).toBe("12 abiertas · 3 en retraso");
    expect(projectFilterCounts({ id: "x", name: "X", open: 1, overdue: 0 })).toBe("1 abierta");
    expect(projectFilterCounts({ id: "x", name: "X" })).toBeNull();
  });
});

describe("ProjectFilter", () => {
  it("opens a searchable multi-select listbox with combobox semantics", async () => {
    renderFilter();
    await open();
    const combobox = screen.getByRole("combobox");
    expect(combobox).toBeTruthy();
    const listbox = screen.getByRole("listbox");
    expect(listbox.getAttribute("aria-multiselectable")).toBe("true");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent?.replace(/,.*$/, "").replace(/\d+/g, "").trim())).toEqual([
      "Todos",
      "Árbol Norte",
      "Casa Lomas",
      "Depto Roma",
    ]);
    expect(options[0].getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      fireEvent.change(combobox, { target: { value: "lomas" } });
    });
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("data-value"))).toEqual(["p1"]);
  });

  it("toggles projects and Todos clears them", async () => {
    const { onChange } = renderFilter(["p1"]);
    await open();
    const casa = screen.getAllByRole("option").find((o) => o.getAttribute("data-value") === "p1")!;
    expect(casa.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getAllByRole("option").find((o) => o.getAttribute("data-value") === "p2")!);
    expect(onChange).toHaveBeenLastCalledWith(["p1", "p2"]);
    fireEvent.click(casa);
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("shows a removable chip per selected project", () => {
    const { onChange } = renderFilter(["p1", "p2"]);
    expect(screen.getByRole("button", { name: "Proyecto: 2 proyectos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar Casa Lomas" }));
    expect(onChange).toHaveBeenCalledWith(["p2"]);
  });

  it("is axe clean, open and closed", async () => {
    const { container } = renderFilter(["p1"]);
    const rules = { rules: { "color-contrast": { enabled: false } } };
    const serious = (r: axe.AxeResults) => r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious(await axe.run(container, rules))).toEqual([]);
    await open();
    expect(serious(await axe.run(document.body, rules))).toEqual([]);
  });
});
