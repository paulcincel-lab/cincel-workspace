// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import axe from "axe-core";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  add: vi.fn(),
  toastError: vi.fn(),
  flags: { toggleChecklistItemAction: true, addChecklistItemAction: true } as Record<string, boolean>,
}));

vi.mock("@/lib/actions/my-space-actions", () => ({
  toggleChecklistItemAction: mocks.toggle,
  addChecklistItemAction: mocks.add,
  fetchRemindersAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/notifications-actions", () => ({}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

// Stand-in for the library table: honors `hideOn` for the current style and
// `renderCell`, so these tests check the data the card hands to the widget.
vi.mock("@/components/widgets/RecordTable", async () => {
  const { useStyle } = await import("@/components/shell/StyleProvider");
  type Props = {
    data: import("@/lib/types/widgets").RecordTableData;
    renderCell?: (key: string, row: Record<string, unknown>) => ReactNode | undefined;
    emptyState?: { title: string };
  };
  return {
    RecordTable: ({ data, renderCell, emptyState }: Props) => {
      const { style } = useStyle();
      const columns = data.columns.filter((c) => !(c.hideOn ?? []).includes(style));
      if (data.rows.length === 0) return <p>{emptyState?.title}</p>;
      if (columns.length === 0) return null;
      return (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={String(row.id ?? i)}>
                {columns.map((c) => (
                  <td key={c.key}>{renderCell?.(c.key, row) ?? String(row[c.key] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { meChecklistsOptions, type ChecklistsData } from "@/lib/query/options/mi-espacio";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_IDS } from "@/lib/ui/themes";
import type { Checklist, PresentationStyle } from "@/lib/types/redesign";

import { ChecklistCard, checklistProgress } from "./ChecklistCard";

const CHECKLIST: Checklist = {
  id: "c1",
  title: "Visita de obra · Ensenada",
  projectId: null,
  projectName: null,
  updatedAt: "2026-11-01T12:00:00.000Z",
  items: [
    { id: "i1", text: "Llevar planos impresos", done: true, sortOrder: 0 },
    { id: "i2", text: "Medir vanos de cancelería", done: true, sortOrder: 1 },
    { id: "i3", text: "Fotos de instalaciones", done: false, sortOrder: 2 },
    { id: "i4", text: "Firmar bitácora", done: false, sortOrder: 3 },
  ],
};

/** The card as Mi espacio renders it: the checklist row of the `me.checklists` query. */
function CachedCard() {
  const { data } = useInfiniteQuery({ ...meChecklistsOptions(), enabled: false });
  const checklist = data?.pages[0]?.items[0];
  return checklist ? <ChecklistCard checklist={checklist} /> : null;
}

function renderCard(style: PresentationStyle = "visual") {
  const client = createTestQueryClient();
  client.setQueryData<ChecklistsData>(qk.me.checklists(), {
    pages: [{ items: [CHECKLIST], nextCursor: null }],
    pageParams: [null],
  });
  const result = renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <CachedCard />
    </StyleProvider>,
    { client },
  );
  const cached = () => client.getQueryData<ChecklistsData>(qk.me.checklists())!.pages[0]!.items[0]!;
  return { ...result, cached };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function box(name: string) {
  return screen.getByRole("checkbox", { name });
}

function isChecked(el: HTMLElement) {
  return el.getAttribute("aria-checked") === "true";
}

function progressValue() {
  return screen.getByRole("progressbar", { name: `Avance de ${CHECKLIST.title}` }).getAttribute("aria-valuenow");
}

beforeEach(() => {
  mocks.toggle.mockReset();
  mocks.add.mockReset();
  mocks.toastError.mockReset();
  mocks.flags.toggleChecklistItemAction = true;
  mocks.flags.addChecklistItemAction = true;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

describe("checklistProgress", () => {
  it("counts done, total and a whole percent", () => {
    expect(checklistProgress(CHECKLIST)).toEqual({ done: 2, total: 4, pct: 50 });
    expect(checklistProgress({ ...CHECKLIST, items: [] })).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe("ChecklistCard", () => {
  it("shows the title, the n/m counter, the progress bar and every item", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: CHECKLIST.title })).toBeTruthy();
    expect(screen.getByText("2/4 completados")).toBeTruthy();
    expect(progressValue()).toBe("50");
    expect(isChecked(box("Llevar planos impresos"))).toBe(true);
    expect(isChecked(box("Fotos de instalaciones"))).toBe(false);
  });

  it("patches me.checklists optimistically with one action call, then keeps the saved item", async () => {
    const call = deferred<{ ok: true; data: Checklist["items"][number] }>();
    mocks.toggle.mockReturnValue(call.promise);
    const { cached } = renderCard();

    fireEvent.click(box("Fotos de instalaciones"));
    await waitFor(() => expect(isChecked(box("Fotos de instalaciones"))).toBe(true));
    expect(mocks.toggle).toHaveBeenCalledTimes(1);
    expect(mocks.toggle).toHaveBeenCalledWith("i3", true);
    expect(screen.getByText("3/4 completados")).toBeTruthy();
    expect(progressValue()).toBe("75");
    expect(cached().items.find((i) => i.id === "i3")?.done).toBe(true);

    await act(async () =>
      call.resolve({ ok: true, data: { id: "i3", text: "Fotos de instalaciones", done: true, sortOrder: 2 } }),
    );
    expect(isChecked(box("Fotos de instalaciones"))).toBe(true);
    expect(cached().items.find((i) => i.id === "i3")?.done).toBe(true);
    expect(mocks.toggle).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("rolls back a failed toggle and shows an error toast", async () => {
    mocks.toggle.mockRejectedValue(new Error("FORBIDDEN"));
    const { cached } = renderCard();

    fireEvent.click(box("Llevar planos impresos"));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    expect(isChecked(box("Llevar planos impresos"))).toBe(true);
    expect(screen.getByText("2/4 completados")).toBeTruthy();
    expect(progressValue()).toBe("50");
    expect(cached().items.find((i) => i.id === "i1")?.done).toBe(true);
  });

  it("rolls back an { ok: false } result with its error copy", async () => {
    mocks.toggle.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    const { cached } = renderCard();

    fireEvent.click(box("Fotos de instalaciones"));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Ya no existe. Recarga la página."));
    expect(isChecked(box("Fotos de instalaciones"))).toBe(false);
    expect(cached().items.find((i) => i.id === "i3")?.done).toBe(false);
    expect(mocks.toggle).toHaveBeenCalledTimes(1);
  });

  it("toggles an item with Space", async () => {
    mocks.toggle.mockResolvedValue({ id: "i4", text: "Firmar bitácora", done: true, sortOrder: 3 });
    renderCard();
    const el = box("Firmar bitácora");
    el.focus();
    fireEvent.keyDown(el, { key: " ", code: "Space" });
    fireEvent.keyUp(el, { key: " ", code: "Space" });
    await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith("i4", true));
  });

  it("adds an item at the end when Enter is pressed", async () => {
    mocks.add.mockResolvedValue({ id: "i5", text: "Revisar niveles", done: false, sortOrder: 4 });
    renderCard();
    const input = screen.getByRole("textbox", { name: "Nuevo punto" });
    fireEvent.change(input, { target: { value: "  Revisar niveles  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(box("Revisar niveles")).toBeTruthy());
    expect(mocks.add).toHaveBeenCalledWith("c1", "Revisar niveles");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[boxes.length - 1].getAttribute("aria-label")).toBe("Revisar niveles");
    expect(screen.getByText("2/5 completados")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows the INVALID copy for an empty item and calls nothing", () => {
    renderCard();
    const input = screen.getByRole("textbox", { name: "Nuevo punto" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("shows the action error under the input when adding fails", async () => {
    mocks.add.mockRejectedValue(new Error("NOT_FOUND"));
    renderCard();
    const input = screen.getByRole("textbox", { name: "Nuevo punto" });
    fireEvent.change(input, { target: { value: "Otro punto" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Ya no existe. Recarga la página."));
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("hides the add input and disables toggles while the actions are not implemented", () => {
    mocks.flags.toggleChecklistItemAction = false;
    mocks.flags.addChecklistItemAction = false;
    renderCard();
    expect(screen.queryByRole("textbox", { name: "Nuevo punto" })).toBeNull();
    const el = box("Fotos de instalaciones");
    expect(el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(el);
    expect(mocks.toggle).not.toHaveBeenCalled();
  });
});

describe("ChecklistCard styles", () => {
  it("Visual: counter and progress bar", () => {
    renderCard("visual");
    expect(screen.getByText("2/4 completados")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Hechos" })).toBeNull();
  });

  it("Esencial: text list with checkboxes, no progress bar", () => {
    renderCard("esencial");
    expect(screen.getByText("2/4 completados")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("Analítico: table with Lista, Hechos, Total and %", () => {
    renderCard("analitico");
    for (const label of ["Lista", "Hechos", "Total", "%"]) {
      expect(screen.getByRole("columnheader", { name: label })).toBeTruthy();
    }
    const table = screen.getByRole("columnheader", { name: "Hechos" }).closest("table") as HTMLElement;
    const cells = within(table).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual([CHECKLIST.title, "2", "4", "50%"]);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });
});

describe("ChecklistCard a11y", () => {
  const styles: PresentationStyle[] = ["visual", "esencial", "analitico"];
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      for (const style of styles) {
        it(`no serious or critical violations · ${theme} ${mode} ${style}`, async () => {
          document.documentElement.setAttribute("data-theme", mode);
          document.documentElement.dataset.themeId = theme;
          document.documentElement.classList.toggle("dark", mode === "dark");
          renderCard(style);
          // happy-dom computes no styles; token contrast is covered by lib/ui/contrast.ts.
          const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
          const blocking = results.violations
            .filter((v) => v.impact === "serious" || v.impact === "critical")
            .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
          expect(blocking).toEqual([]);
        });
      }
    }
  }
});
