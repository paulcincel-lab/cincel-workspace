// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

import { CellEditor, type CellEditorProps } from "@/components/widgets/CellEditor";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { type PeopleCellEdit, PEOPLE_EMPTY, sameCellValue } from "@/components/widgets/editable-cell";

type Row = { id: string; managerId: string | null; support: string[] };

const row: Row = { id: "t1", managerId: "u1", support: ["u2"] };
const ok = async () => ({ ok: true as const, data: null });

const peopleEdit: PeopleCellEdit<Row> = {
  kind: "people",
  value: (r) => r.support,
  options: () => [
    { value: "u1", label: "Ana López", avatar: { name: "Ana López" } },
    { value: "u2", label: "Bruno Díaz", avatar: { name: "Bruno Díaz" } },
    { value: "u3", label: "Carla Ruiz", avatar: { name: "Carla Ruiz" } },
  ],
  exclude: (r) => (r.managerId ? [r.managerId] : []),
  excludedLabel: "Ya es responsable",
  commit: ok,
};

function setup(extra: Partial<CellEditorProps<Row>> = {}) {
  const anchor = document.createElement("button");
  anchor.textContent = "celda";
  document.body.appendChild(anchor);
  const onOpenChange = vi.fn();
  const onCommitted = vi.fn();
  const onTabNext = vi.fn();
  const utils = render(
    <CellEditor
      anchor={anchor}
      edit={peopleEdit}
      row={row}
      canEdit
      open
      onOpenChange={onOpenChange}
      onCommitted={onCommitted}
      onTabNext={onTabNext}
      label="Apoyo"
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
const root = () => document.querySelector("[cmdk-root]") as HTMLElement;
const optionByName = (name: string) => options().find((o) => o.textContent?.includes(name))!;

describe("CellEditor: people", () => {
  it("lists everyone with a search box, the picked people first and checked, the Responsable disabled", async () => {
    setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(options().map((o) => o.textContent)).toEqual(["BDBruno Díaz", "ALAna LópezYa es responsable", "CRCarla Ruiz"]);
    expect(optionByName("Bruno").getAttribute("aria-checked")).toBe("true");
    expect(optionByName("Carla").getAttribute("aria-checked")).toBe("false");
    expect(optionByName("Ana").getAttribute("aria-disabled")).toBe("true");
  });

  it("clicks toggle without closing; Enter saves the whole list", async () => {
    const { onCommitted, onOpenChange } = setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.click(screen.getByText("Carla Ruiz"));
    fireEvent.click(screen.getByText("Bruno Díaz"));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(optionByName("Carla").getAttribute("aria-checked")).toBe("true");
    expect(optionByName("Bruno").getAttribute("aria-checked")).toBe("false");
    fireEvent.keyDown(root(), { key: "Enter" });
    expect(onCommitted).toHaveBeenCalledWith(["u3"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the Responsable can't be picked", async () => {
    const { onCommitted } = setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.click(screen.getByText("Ana López"));
    fireEvent.keyDown(root(), { key: "Enter" });
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("keyboard: ↓ moves, Space toggles, Tab saves and asks for the next cell", async () => {
    const { onCommitted, onTabNext } = setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    // Bruno is highlighted first; ↓ skips the disabled Responsable to Carla.
    fireEvent.keyDown(root(), { key: "ArrowDown" });
    fireEvent.keyDown(root(), { key: " " });
    fireEvent.keyDown(root(), { key: "Tab" });
    expect(onCommitted).toHaveBeenCalledWith(["u2", "u3"]);
    expect(onTabNext).toHaveBeenCalled();
  });

  it("search narrows the list; Space toggles the first match", async () => {
    const { onCommitted } = setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "carla" } });
    await waitFor(() => expect(options()).toHaveLength(1));
    fireEvent.keyDown(root(), { key: " " });
    fireEvent.keyDown(root(), { key: "Enter" });
    expect(onCommitted).toHaveBeenCalledWith(["u2", "u3"]);
  });

  it("closing (Esc) saves the picks; closing without changes saves nothing", async () => {
    const first = setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.click(screen.getByText("Carla Ruiz"));
    fireEvent.keyDown(root(), { key: "Escape" });
    expect(first.onCommitted).toHaveBeenCalledWith(["u2", "u3"]);
    expect(first.onOpenChange).toHaveBeenCalledWith(false);
    cleanup();

    const second = setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.keyDown(root(), { key: "Escape" });
    expect(second.onCommitted).not.toHaveBeenCalled();
  });

  it("closed from outside (open turns false), the picks still save", async () => {
    const { onCommitted, rerender, anchor, onOpenChange } = setup();
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.click(screen.getByText("Carla Ruiz"));
    rerender(
      <CellEditor anchor={anchor} edit={peopleEdit} row={row} canEdit open={false} onOpenChange={onOpenChange} onCommitted={onCommitted} label="Apoyo" />,
    );
    expect(onCommitted).toHaveBeenCalledWith(["u2", "u3"]);
  });

  it("a locked cell shows only its reason", async () => {
    setup({ canEdit: "Solo un admin puede cambiar el equipo de apoyo." });
    await waitFor(() => expect(screen.getByText("Solo un admin puede cambiar el equipo de apoyo.")).toBeTruthy());
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  for (const mode of ["light", "dark"] as const) {
    it(`people popover has no serious or critical axe violations (${mode})`, async () => {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
      setup();
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
});

describe("PeopleStack", () => {
  const people = [
    { id: "a", name: "Ana López" },
    { id: "b", name: "Bruno Díaz" },
    { id: "c", name: "Carla Ruiz" },
    { id: "d", name: "Diego Mora" },
    { id: "e", name: "Elena Paz" },
  ];

  it("shows up to 3 avatars then +n, and the names for screen readers", () => {
    const { container } = render(<PeopleStack people={people} label="Apoyo" />);
    expect(container.querySelectorAll("[data-slot=avatar]")).toHaveLength(3);
    expect(container.querySelector("[data-slot=avatar-group-count]")?.textContent).toBe("+2");
    expect(screen.getByText("Apoyo: Ana López, Bruno Díaz, Carla Ruiz, Diego Mora, Elena Paz")).toBeTruthy();
  });

  it("nobody shows —", () => {
    const { container } = render(<PeopleStack people={[]} />);
    expect(container.textContent).toBe(PEOPLE_EMPTY);
  });
});

describe("sameCellValue", () => {
  it("lists compare as sets; single values by identity", () => {
    expect(sameCellValue(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameCellValue(["a"], ["a", "b"])).toBe(false);
    expect(sameCellValue([], null)).toBe(false);
    expect(sameCellValue("x", "x")).toBe(true);
    expect(sameCellValue(null, null)).toBe(true);
  });
});
