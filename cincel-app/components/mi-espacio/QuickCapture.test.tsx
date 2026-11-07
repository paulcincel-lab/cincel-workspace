// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/lib/actions/my-space-actions", () => actions);

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

import { QuickCapture, QUICK_CAPTURE_PLACEHOLDER, isChecklistText, parseChecklistText } from "./QuickCapture";

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
    render(<QuickCapture onCreated={vi.fn()} />);
    expect(input().getAttribute("placeholder")).toBe(QUICK_CAPTURE_PLACEHOLDER);
    for (const name of ["Nota", "Checklist", "Recordatorio"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("routes “- [ ] …” to a checklist, toasts and clears the input", async () => {
    const onCreated = vi.fn();
    render(<QuickCapture onCreated={onCreated} />);
    type("- [ ] Visita de obra - [ ] planos - [ ] fotos");
    enter();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("checklist"));
    expect(actions.createChecklistAction).toHaveBeenCalledWith({ title: "Visita de obra", items: ["planos", "fotos"] });
    expect(actions.parseReminderTextAction).not.toHaveBeenCalled();
    expect(actions.createNoteAction).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Checklist creado");
    expect(input().value).toBe("");
  });

  it("opens the reminder dialog prefilled when the text has a date", async () => {
    actions.parseReminderTextAction.mockResolvedValue({ cleanText: "llamar a Juanma", dueAt: DUE, repeat: "none" });
    const onCreated = vi.fn();
    render(<QuickCapture onCreated={onCreated} />);
    type("recuérdame mañana 9am llamar a Juanma");
    enter();

    const dialog = await screen.findByRole("dialog", { name: "Nuevo recordatorio" });
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId("reminder-text").textContent).toBe("recuérdame mañana 9am llamar a Juanma");
    expect(screen.getByTestId("reminder-due").textContent).toBe(DUE);
    expect(actions.parseReminderTextAction).toHaveBeenCalledWith("recuérdame mañana 9am llamar a Juanma");
    expect(actions.createNoteAction).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    expect(onCreated).toHaveBeenCalledWith("recordatorio");
    expect(input().value).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves anything else as a note, toasts and clears the input", async () => {
    const onCreated = vi.fn();
    render(<QuickCapture onCreated={onCreated} />);
    type("Ideas para la recepción");
    enter();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("nota"));
    expect(actions.parseReminderTextAction).toHaveBeenCalledWith("Ideas para la recepción");
    expect(actions.createNoteAction).toHaveBeenCalledWith({ body: "Ideas para la recepción" });
    expect(toast.success).toHaveBeenCalledWith("Nota guardada");
    expect(input().value).toBe("");
  });

  it("does nothing on Enter with an empty input", async () => {
    const onCreated = vi.fn();
    render(<QuickCapture onCreated={onCreated} />);
    type("   ");
    enter();

    await Promise.resolve();
    expect(actions.createNoteAction).not.toHaveBeenCalled();
    expect(actions.createChecklistAction).not.toHaveBeenCalled();
    expect(actions.parseReminderTextAction).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows the INVALID copy inline and keeps the text when a save fails", async () => {
    actions.createNoteAction.mockRejectedValue(new Error("INVALID"));
    const onCreated = vi.fn();
    render(<QuickCapture onCreated={onCreated} />);
    type("Una nota");
    enter();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.",
    );
    expect(input().value).toBe("Una nota");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("“Nota” with an empty input opens the editor through ?nota=nueva", () => {
    render(<QuickCapture onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Nota" }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("nota", "nueva");
    expect(actions.createNoteAction).not.toHaveBeenCalled();
  });

  it("“Recordatorio” opens the dialog with the parsed text even without a date", async () => {
    render(<QuickCapture onCreated={vi.fn()} />);
    type("llamar a Juanma");
    fireEvent.click(screen.getByRole("button", { name: "Recordatorio" }));
    expect(await screen.findByRole("dialog", { name: "Nuevo recordatorio" })).toBeTruthy();
    expect(screen.getByTestId("reminder-text").textContent).toBe("llamar a Juanma");
  });

  it("falls back to a note when the reminder actions are stubs", async () => {
    flags.parseReminderTextAction = false;
    const onCreated = vi.fn();
    render(<QuickCapture onCreated={onCreated} />);
    expect(screen.queryByRole("button", { name: "Recordatorio" })).toBeNull();
    type("mañana 9am llamar a Juanma");
    enter();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("nota"));
    expect(actions.parseReminderTextAction).not.toHaveBeenCalled();
  });

  it("renders nothing while every capture action is a stub", () => {
    Object.assign(flags, {
      createNoteAction: false,
      createChecklistAction: false,
      parseReminderTextAction: false,
      createReminderAction: false,
    });
    const { container } = render(<QuickCapture onCreated={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("has no serious axe violations", async () => {
    const { container } = render(<QuickCapture onCreated={vi.fn()} />);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
