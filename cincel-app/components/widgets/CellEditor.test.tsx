// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import { CellEditor, type CellEditorProps } from "@/components/widgets/CellEditor";
import { type CellEdit, EMPTY_TITLE_ERROR, quickPickDate } from "@/components/widgets/editable-cell";

type Row = { id: string; status: string | null; owner: string | null; due: string | null; title: string };

const row: Row = { id: "t1", status: "curso", owner: "u1", due: "2026-11-10", title: "Planos" };
const ok = async () => ({ ok: true as const, data: null });

const statusEdit: CellEdit<Row> = {
  kind: "select",
  clearable: true,
  value: (r) => r.status,
  options: () => [
    { value: "pendiente", label: "Pendiente", color: "var(--chart-1)" },
    { value: "curso", label: "En curso", color: "var(--chart-2)" },
    { value: "revision", label: "En revisión", color: "var(--chart-3)" },
  ],
  commit: ok,
};

const manyEdit: CellEdit<Row> = {
  ...statusEdit,
  clearable: false,
  options: () =>
    ["Arquitectura", "Estructura", "Instalaciones", "Interiorismo", "Paisaje", "Urbanismo"].map((label) => ({
      value: label.toLowerCase(),
      label,
    })),
};

const personEdit: CellEdit<Row> = {
  kind: "person",
  clearable: true,
  value: (r) => r.owner,
  options: () => [
    { value: "u1", label: "Ana López", avatar: { name: "Ana López" } },
    { value: "u2", label: "Bruno Díaz", avatar: { name: "Bruno Díaz" } },
  ],
  commit: ok,
};

const dateEdit: CellEdit<Row> = { kind: "date", quickPicks: true, clearable: true, value: (r) => r.due, commit: ok };
const textEdit: CellEdit<Row> = { kind: "text", required: true, value: (r) => r.title, commit: ok };

function setup(edit: CellEdit<Row>, extra: Partial<CellEditorProps<Row>> = {}) {
  const anchor = document.createElement("button");
  anchor.textContent = "celda";
  document.body.appendChild(anchor);
  const onOpenChange = vi.fn();
  const onCommitted = vi.fn();
  const onTabNext = vi.fn();
  const utils = render(
    <CellEditor
      anchor={anchor}
      edit={edit}
      row={row}
      canEdit
      open
      onOpenChange={onOpenChange}
      onCommitted={onCommitted}
      onTabNext={onTabNext}
      label="Estatus"
      {...extra}
    />,
  );
  return { ...utils, anchor, onOpenChange, onCommitted, onTabNext };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-theme");
});

const options = () => screen.getAllByRole("option");
const popup = () => document.querySelector("[data-slot=popover-content]") as HTMLElement;
const field_ = () =>
  waitFor(() => {
    const el = popup()?.querySelector("input");
    if (!el) throw new Error("no field");
    return el;
  });

describe("CellEditor: select", () => {
  it("lists the options with the current one checked and a clear entry, no search under 6 options", async () => {
    setup(statusEdit);
    await waitFor(() => expect(options()).toHaveLength(4));
    expect(options().map((o) => o.textContent)).toEqual(["Pendiente", "En curso", "En revisión", "Sin estatus"]);
    expect(options()[1].getAttribute("data-checked")).toBe("true");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("a pick saves and closes", async () => {
    const { onCommitted, onOpenChange } = setup(statusEdit);
    await waitFor(() => expect(options()).toHaveLength(4));
    fireEvent.click(screen.getByText("En revisión"));
    expect(onCommitted).toHaveBeenCalledWith("revision");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("↓ then Enter saves the next option; picking the current value doesn't save", async () => {
    const { onCommitted, onOpenChange } = setup(statusEdit);
    await waitFor(() => expect(options()).toHaveLength(4));
    const root = document.querySelector("[cmdk-root]") as HTMLElement;
    fireEvent.keyDown(root, { key: "ArrowDown" });
    fireEvent.keyDown(root, { key: "Enter" });
    expect(onCommitted).toHaveBeenCalledWith("revision");
    onCommitted.mockClear();
    fireEvent.click(screen.getByText("En curso"));
    expect(onCommitted).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clear entry saves null", async () => {
    const { onCommitted } = setup(statusEdit);
    await waitFor(() => expect(options()).toHaveLength(4));
    fireEvent.click(screen.getByText("Sin estatus"));
    expect(onCommitted).toHaveBeenCalledWith(null);
  });

  it("Esc closes without saving", async () => {
    const { onCommitted, onOpenChange } = setup(statusEdit);
    await waitFor(() => expect(options()).toHaveLength(4));
    fireEvent.keyDown(document.querySelector("[cmdk-root]") as HTMLElement, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("Tab saves the highlighted option and asks for the next cell", async () => {
    const { onCommitted, onTabNext } = setup(statusEdit);
    await waitFor(() => expect(options()).toHaveLength(4));
    const root = document.querySelector("[cmdk-root]") as HTMLElement;
    fireEvent.keyDown(root, { key: "ArrowUp" });
    fireEvent.keyDown(root, { key: "Tab" });
    expect(onCommitted).toHaveBeenCalledWith("pendiente");
    expect(onTabNext).toHaveBeenCalled();
  });

  it("searches above 5 options; the typed letter seeds the search", async () => {
    const { onCommitted } = setup(manyEdit, { initialQuery: "pai", label: "Disciplina" });
    const search = await screen.findByRole("combobox");
    expect(search.getAttribute("placeholder")).toBe("Buscar disciplina…");
    expect((search as HTMLInputElement).value).toBe("pai");
    expect(options().map((o) => o.textContent)).toEqual(["Paisaje"]);
    fireEvent.change(search, { target: { value: "xyz" } });
    await waitFor(() => expect(screen.getByText("Sin resultados")).toBeTruthy());
    fireEvent.change(search, { target: { value: "urb" } });
    await waitFor(() => expect(options()).toHaveLength(1));
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onCommitted).toHaveBeenCalledWith("urbanismo");
  });
});

describe("CellEditor: person", () => {
  it("always searches, shows avatars and puts Sin asignar first", async () => {
    const { onCommitted } = setup(personEdit, { label: "Responsable" });
    expect(await screen.findByRole("combobox")).toBeTruthy();
    expect(options().map((o) => o.textContent)).toEqual(["Sin asignar", "ALAna López", "BDBruno Díaz"]);
    fireEvent.click(screen.getByText("Bruno Díaz"));
    expect(onCommitted).toHaveBeenCalledWith("u2");
  });

  it("search ignores accents", async () => {
    setup(personEdit, { label: "Responsable", initialQuery: "diaz" });
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(options()[0].textContent).toContain("Bruno Díaz");
  });
});

describe("CellEditor: date", () => {
  it("quick picks save their date; Sin fecha clears", async () => {
    const { onCommitted } = setup(dateEdit, { label: "Vence" });
    fireEvent.click(await screen.findByRole("button", { name: "Mañana" }));
    expect(onCommitted).toHaveBeenLastCalledWith(quickPickDate("tomorrow"));
    fireEvent.click(screen.getByRole("button", { name: "Sin fecha" }));
    expect(onCommitted).toHaveBeenLastCalledWith(null);
    expect(within(popup()).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Hoy",
      "Mañana",
      "Próximo lunes",
      "+1 semana",
      "Sin fecha",
    ]);
  });

  it("a typed date saves on Enter; Esc doesn't save", async () => {
    const { onCommitted, onOpenChange } = setup(dateEdit, { label: "Vence" });
    const field = (await field_());
    fireEvent.keyDown(field, { key: "2" });
    fireEvent.change(field, { target: { value: "2026-12-01" } });
    expect(onCommitted).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCommitted).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommitted).toHaveBeenCalledWith("2026-12-01");
  });

  it("a pick from the calendar saves at once", async () => {
    const { onCommitted } = setup(dateEdit, { label: "Vence" });
    const field = (await field_());
    fireEvent.change(field, { target: { value: "2026-12-24" } });
    expect(onCommitted).toHaveBeenCalledWith("2026-12-24");
  });

  it("without clearable there is no Sin fecha", async () => {
    setup({ ...dateEdit, clearable: false }, { label: "Vence" });
    await screen.findByRole("button", { name: "Hoy" });
    expect(screen.queryByRole("button", { name: "Sin fecha" })).toBeNull();
  });
});

describe("CellEditor: text", () => {
  it("Enter saves the trimmed text; required blocks empty", async () => {
    const { onCommitted, onOpenChange } = setup(textEdit, { label: "Título" });
    const field = (await field_());
    expect(field.value).toBe("Planos");
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toBe(EMPTY_TITLE_ERROR);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "  Planos de fachada " } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onCommitted).toHaveBeenCalledWith("Planos de fachada");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Esc cancels; Tab saves and moves on", async () => {
    const { onCommitted, onOpenChange, onTabNext } = setup(textEdit, { label: "Título" });
    const field = (await field_());
    fireEvent.change(field, { target: { value: "Otro" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCommitted).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Tab" });
    expect(onCommitted).toHaveBeenCalledWith("Otro");
    expect(onTabNext).toHaveBeenCalled();
  });
});

describe("CellEditor: locked and focus", () => {
  it("a locked cell shows only the reason", async () => {
    setup(statusEdit, { canEdit: "Solo un admin puede mover la tarea de tramo." });
    expect(await screen.findByText("Solo un admin puede mover la tarea de tramo.")).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("focus returns to the anchor on close", async () => {
    const { anchor, rerender, onOpenChange } = setup(textEdit, { label: "Título" });
    const field = await field_();
    await waitFor(() => expect(document.activeElement).toBe(field));
    rerender(
      <CellEditor anchor={anchor} edit={textEdit} row={row} canEdit open={false} onOpenChange={onOpenChange} label="Título" />,
    );
    await waitFor(() => expect(document.activeElement).toBe(anchor));
  });
});

describe("CellEditor accessibility", () => {
  const cases: [string, CellEdit<Row>, Partial<CellEditorProps<Row>>][] = [
    ["select", statusEdit, {}],
    ["person", personEdit, { label: "Responsable" }],
    ["date", dateEdit, { label: "Vence" }],
    ["text", textEdit, { label: "Título" }],
    ["locked", statusEdit, { canEdit: "Solo un admin puede cambiar este proyecto." }],
  ];
  for (const mode of ["light", "dark"] as const) {
    for (const [name, edit, extra] of cases) {
      it(`${name} popover has no serious or critical axe violations (${mode})`, async () => {
        document.documentElement.setAttribute("data-theme", mode);
        document.documentElement.classList.toggle("dark", mode === "dark");
        setup(edit, extra);
        const popup = await waitFor(() => {
          const el = document.querySelector("[data-slot=popover-content]");
          if (!el) throw new Error("no popup");
          return el as HTMLElement;
        });
        await act(async () => {});
        const results = await axe.run(popup, { rules: { "color-contrast": { enabled: false } } });
        const serious = results.violations
          .filter((v) => v.impact === "critical" || v.impact === "serious")
          .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
        expect(serious).toEqual([]);
      });
    }
  }
});
