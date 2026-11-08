// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

import type { ReminderDialogProps } from "./ReminderDialog";

const flags = vi.hoisted(() => ({
  createNoteAction: true,
  createChecklistAction: true,
  parseReminderTextAction: true,
  createReminderAction: true,
}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags }));

const actions = vi.hoisted(() => ({
  createNoteAction: vi.fn(),
  createChecklistAction: vi.fn(),
  parseReminderTextAction: vi.fn(),
}));
vi.mock("@/lib/actions/my-space-actions", () => ({ ...actions, fetchRemindersAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/notifications-actions", () => ({}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const params = vi.hoisted(() => ({ replaceMiEspacioParam: vi.fn() }));
vi.mock("./search-params", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./search-params")>()),
  replaceMiEspacioParam: params.replaceMiEspacioParam,
}));

// The dialog is its own issue; here it only shows what QuickCapture hands it.
vi.mock("./ReminderDialog", () => ({
  ReminderDialog: (props: ReminderDialogProps) =>
    props.open ? (
      <div role="dialog" aria-label="Nuevo recordatorio">
        <p data-testid="reminder-text">{props.initialText ?? ""}</p>
        <p data-testid="reminder-due">{props.parsed?.dueAt ?? ""}</p>
        <button
          type="button"
          onClick={() =>
            props.onCreated({
              id: "r1",
              text: props.parsed?.cleanText ?? "",
              dueAt: props.parsed?.dueAt ?? "",
              repeat: "none",
              channels: ["app"],
              taskId: null,
              projectId: null,
              firedAt: null,
              cancelledAt: null,
            })
          }
        >
          Crear recordatorio
        </button>
      </div>
    ) : null,
}));

import { qk } from "@/lib/query/keys";
import type { ChecklistsData, NotesData } from "@/lib/query/options/mi-espacio";
import { renderWithQueryClient } from "@/lib/query/test-utils";

import { QuickCapture, QUICK_CAPTURE_PLACEHOLDER, isChecklistText, parseChecklistText } from "./QuickCapture";

/** Renders under a query client; the created note / checklist lands in `me.notes` / `me.checklists`. */
function renderCapture() {
  const result = renderWithQueryClient(<QuickCapture />);
  const notes = () => result.client.getQueryData<NotesData>(qk.me.notes())?.pages.flatMap((p) => p.items) ?? [];
  const checklists = () =>
    result.client.getQueryData<ChecklistsData>(qk.me.checklists())?.pages.flatMap((p) => p.items) ?? [];
  return { ...result, notes, checklists };
}

const DUE = "2026-11-08T15:00:00.000Z";

function input(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "Captura rápida" }) as HTMLInputElement;
}

function type(value: string) {
  fireEvent.change(input(), { target: { value } });
}

function enter() {
  fireEvent.keyDown(input(), { key: "Enter" });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(flags, {
    createNoteAction: true,
    createChecklistAction: true,
    parseReminderTextAction: true,
    createReminderAction: true,
  });
  actions.createNoteAction.mockResolvedValue({ id: "n1" });
  actions.createChecklistAction.mockResolvedValue({ id: "c1" });
  actions.parseReminderTextAction.mockImplementation(async (text: string) => ({
    cleanText: text,
    dueAt: null,
    repeat: "none",
  }));
});

afterEach(() => {
  cleanup();
});

describe("parseChecklistText", () => {
  it("detects the checklist marker", () => {
    expect(isChecklistText("- [ ] comprar cemento")).toBe(true);
    expect(isChecklistText("-[] comprar cemento")).toBe(true);
    expect(isChecklistText("comprar - [ ] cemento")).toBe(false);
  });

  it("splits the title and the items", () => {
    expect(parseChecklistText("- [ ] Visita de obra - [ ] planos - [ ] fotos")).toEqual({
      title: "Visita de obra",
      items: ["planos", "fotos"],
    });
    expect(parseChecklistText("- [ ] Visita de obra")).toEqual({ title: "Visita de obra", items: [] });
    expect(parseChecklistText("- [ ]")).toBeNull();
  });
});

describe("QuickCapture", () => {
  it("renders the input with the capture placeholder and the three buttons", () => {
    renderCapture();
    expect(input().getAttribute("placeholder")).toBe(QUICK_CAPTURE_PLACEHOLDER);
    for (const name of ["Nota", "Checklist", "Recordatorio"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("routes “- [ ] …” to a checklist, toasts and clears the input", async () => {
    const view = renderCapture();
    type("- [ ] Visita de obra - [ ] planos - [ ] fotos");
    enter();

    await waitFor(() => expect(view.checklists()).toEqual([{ id: "c1" }]));
    expect(actions.createChecklistAction).toHaveBeenCalledWith({ title: "Visita de obra", items: ["planos", "fotos"] });
    expect(actions.parseReminderTextAction).not.toHaveBeenCalled();
    expect(actions.createNoteAction).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Checklist creado");
    expect(input().value).toBe("");
  });

  it("opens the reminder dialog prefilled when the text has a date", async () => {
    actions.parseReminderTextAction.mockResolvedValue({ cleanText: "llamar a Juanma", dueAt: DUE, repeat: "none" });
    const view = renderCapture();
    type("recuérdame mañana 9am llamar a Juanma");
    enter();

    const dialog = await screen.findByRole("dialog", { name: "Nuevo recordatorio" });
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId("reminder-text").textContent).toBe("recuérdame mañana 9am llamar a Juanma");
    expect(screen.getByTestId("reminder-due").textContent).toBe(DUE);
    expect(actions.parseReminderTextAction).toHaveBeenCalledWith("recuérdame mañana 9am llamar a Juanma");
    expect(actions.createNoteAction).not.toHaveBeenCalled();
    expect(view.notes()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    expect(input().value).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves anything else as a note, toasts and clears the input", async () => {
    const view = renderCapture();
    type("Ideas para la recepción");
    enter();

    await waitFor(() => expect(view.notes()).toEqual([{ id: "n1" }]));
    expect(actions.parseReminderTextAction).toHaveBeenCalledWith("Ideas para la recepción");
    expect(actions.createNoteAction).toHaveBeenCalledWith({ body: "Ideas para la recepción" });
    expect(toast.success).toHaveBeenCalledWith("Nota guardada");
    expect(input().value).toBe("");
  });

  it("does nothing on Enter with an empty input", async () => {
    const view = renderCapture();
    type("   ");
    enter();

    await Promise.resolve();
    expect(actions.createNoteAction).not.toHaveBeenCalled();
    expect(actions.createChecklistAction).not.toHaveBeenCalled();
    expect(actions.parseReminderTextAction).not.toHaveBeenCalled();
    expect(view.notes()).toEqual([]);
  });

  it("shows the INVALID copy inline and keeps the text when a save fails", async () => {
    actions.createNoteAction.mockRejectedValue(new Error("INVALID"));
    const view = renderCapture();
    type("Una nota");
    enter();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(input().value).toBe("Una nota");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(view.notes()).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows an { ok: false } result inline too", async () => {
    actions.createChecklistAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    const view = renderCapture();
    type("- [ ] Visita");
    enter();
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
    expect(view.checklists()).toEqual([]);
  });

  it("“Nota” with an empty input opens the editor through ?nota=nueva", () => {
    renderCapture();
    fireEvent.click(screen.getByRole("button", { name: "Nota" }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("nota", "nueva");
    expect(actions.createNoteAction).not.toHaveBeenCalled();
  });

  it("“Recordatorio” opens the dialog with the parsed text even without a date", async () => {
    renderCapture();
    type("llamar a Juanma");
    fireEvent.click(screen.getByRole("button", { name: "Recordatorio" }));
    expect(await screen.findByRole("dialog", { name: "Nuevo recordatorio" })).toBeTruthy();
    expect(screen.getByTestId("reminder-text").textContent).toBe("llamar a Juanma");
  });

  it("falls back to a note when the reminder actions are stubs", async () => {
    flags.parseReminderTextAction = false;
    const view = renderCapture();
    expect(screen.queryByRole("button", { name: "Recordatorio" })).toBeNull();
    type("mañana 9am llamar a Juanma");
    enter();

    await waitFor(() => expect(view.notes()).toEqual([{ id: "n1" }]));
    expect(actions.parseReminderTextAction).not.toHaveBeenCalled();
  });

  it("renders nothing while every capture action is a stub", () => {
    Object.assign(flags, {
      createNoteAction: false,
      createChecklistAction: false,
      parseReminderTextAction: false,
      createReminderAction: false,
    });
    const { container } = renderCapture();
    expect(container.innerHTML).toBe("");
  });

  it("has no serious axe violations", async () => {
    const { container } = renderCapture();
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
