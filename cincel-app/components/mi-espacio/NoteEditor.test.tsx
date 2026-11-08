// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

import type { FormSheetProps } from "@/components/patterns/FormSheet";
import type { Note } from "@/lib/types/redesign";

const actions = vi.hoisted(() => ({
  createNoteAction: vi.fn(),
  updateNoteAction: vi.fn(),
  archiveNoteAction: vi.fn(),
  restoreNoteAction: vi.fn(),
}));
const flags = vi.hoisted(() => ({ value: {} as Record<string, boolean> }));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/my-space-actions", () => ({ ...actions, fetchRemindersAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/notifications-actions", () => ({}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, { get: (_t, key: string) => flags.value[key] ?? true }),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

/** Contract stand-in for the shared sheet pattern: title, inline error, body, "Cancelar" + submit. */
vi.mock("@/components/patterns/FormSheet", () => ({
  FormSheet: (props: FormSheetProps) =>
    props.open ? (
      <section role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        {props.error ? <div role="alert">{props.error}</div> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void props.onSubmit();
          }}
        >
          {props.children}
          <button type="button" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </button>
          <button type="submit" disabled={props.pending}>
            {props.submitLabel}
          </button>
        </form>
      </section>
    ) : null,
}));

import { NoteEditor, type NoteEditorProps } from "@/components/mi-espacio/NoteEditor";
import { actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import type { NotesData } from "@/lib/query/options/mi-espacio";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetNewTaskUi, useNewTaskUi } from "@/lib/stores/new-task-store";
import { NOTE_BODY_MAX, NOTE_UNDO_MS, applyMarkdown } from "@/lib/my-space/note-ui";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

const INVALID_COPY = "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";

const NOTE: Note = {
  id: "n1",
  title: "Proveedores",
  body: "Llamar a Juanma\nPedir muestras",
  color: "blue",
  pinned: false,
  projectId: "p1",
  updatedAt: "2026-11-07T10:00:00.000Z",
};

function renderEditor(props: Partial<NoteEditorProps> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onSaved: vi.fn(),
    onArchived: vi.fn(),
  };
  const client = createTestQueryClient();
  client.setQueryData<NotesData>(qk.me.notes(), { pages: [{ items: [NOTE], nextCursor: null }], pageParams: [null] });
  renderWithQueryClient(<NoteEditor note={null} open {...handlers} {...props} />, { client });
  const cachedNotes = () => client.getQueryData<NotesData>(qk.me.notes())?.pages.flatMap((p) => p.items) ?? [];
  return { ...handlers, client, cachedNotes };
}

function body(): HTMLTextAreaElement {
  return screen.getByLabelText("Nota") as HTMLTextAreaElement;
}

beforeEach(() => {
  flags.value = {};
  for (const fn of Object.values(actions)) fn.mockReset();
  toastMock.mockReset();
  resetNewTaskUi();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

describe("NoteEditor", () => {
  it("creates a note, toasts Nota guardada and hands it to the grid", async () => {
    const saved = { ...NOTE, id: "new", title: "Compras", body: "Cemento", color: "amber" as const, pinned: true };
    actions.createNoteAction.mockResolvedValue(saved);
    const h = renderEditor();
    expect(screen.getByRole("heading", { name: "Nueva nota" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Compras" } });
    fireEvent.change(body(), { target: { value: "Cemento" } });
    fireEvent.click(screen.getByRole("radio", { name: "Ámbar" }));
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith(saved));
    expect(actions.createNoteAction).toHaveBeenCalledWith({ title: "Compras", body: "Cemento", color: "amber", pinned: true });
    expect(toastMock).toHaveBeenCalledWith("Nota guardada");
    expect(h.onOpenChange).toHaveBeenCalledWith(false);
    expect(h.cachedNotes()[0]).toEqual(saved);
  });

  it("edits an existing note through updateNoteAction", async () => {
    const saved = { ...NOTE, title: "Proveedores CDMX" };
    actions.updateNoteAction.mockResolvedValue(saved);
    const h = renderEditor({ note: NOTE });
    expect(screen.getByRole("heading", { name: "Editar nota" })).toBeTruthy();
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Proveedores");
    expect(body().value).toBe(NOTE.body);
    expect(screen.getByRole("radio", { name: "Azul" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Proveedores CDMX" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith(saved));
    expect(actions.updateNoteAction).toHaveBeenCalledWith("n1", {
      title: "Proveedores CDMX",
      body: NOTE.body,
      color: "blue",
      pinned: false,
    });
    expect(toastMock).toHaveBeenCalledWith("Nota guardada");
    expect(h.cachedNotes()).toEqual([saved]);
  });

  it("patches me.notes before the server answers and rolls the edit back on error", async () => {
    let fail!: (err: unknown) => void;
    actions.updateNoteAction.mockReturnValue(new Promise((_res, rej) => (fail = rej)));
    const h = renderEditor({ note: NOTE });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Proveedores CDMX" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.cachedNotes()[0]?.title).toBe("Proveedores CDMX"));
    fail(new Error("FORBIDDEN"));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
    expect(h.cachedNotes()[0]?.title).toBe("Proveedores");
    expect(h.onSaved).not.toHaveBeenCalled();
  });

  it("shows the INVALID copy inline for an empty note and for a 20 001-character body", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_COPY);
    fireEvent.change(body(), { target: { value: "x".repeat(NOTE_BODY_MAX + 1) } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toBe(INVALID_COPY);
    expect(actions.createNoteAction).not.toHaveBeenCalled();
  });

  it("shows server errors through actionErrorText", async () => {
    actions.updateNoteAction.mockRejectedValue(new Error("NOT_FOUND"));
    renderEditor({ note: NOTE });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ya no existe. Recarga la página.");
    actions.updateNoteAction.mockRejectedValue(new Error("FORBIDDEN"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("No tienes permiso para realizar esta acción."));
  });

  it("never calls a write stub while the action is not implemented", async () => {
    flags.value = { createNoteAction: false, archiveNoteAction: false };
    renderEditor();
    fireEvent.change(body(), { target: { value: "Algo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toBe(actionErrorText(new Error("NOT_IMPLEMENTED")));
    expect(actions.createNoteAction).not.toHaveBeenCalled();
    cleanup();
    renderEditor({ note: NOTE });
    expect(screen.queryByRole("button", { name: "Archivar" })).toBeNull();
  });

  it("toolbar applies bold, italic, lista, checklist and enlace", () => {
    renderEditor();
    const toolbar = screen.getByRole("toolbar", { name: "Formato" });
    for (const name of ["Negrita", "Cursiva", "Lista", "Checklist", "Enlace"]) {
      expect(toolbar.querySelector(`[aria-label="${name}"]`)).toBeTruthy();
    }
    fireEvent.change(body(), { target: { value: "hola mundo" } });
    body().setSelectionRange(0, 4);
    fireEvent.click(screen.getByRole("button", { name: "Negrita" }));
    expect(body().value).toBe("**hola** mundo");

    const edit = { value: "uno\ndos", selectionStart: 0, selectionEnd: 7 };
    expect(applyMarkdown(edit, "italic").value).toBe("_uno\ndos_");
    expect(applyMarkdown(edit, "list").value).toBe("- uno\n- dos");
    expect(applyMarkdown(edit, "checklist").value).toBe("- [ ] uno\n- [ ] dos");
    expect(applyMarkdown({ value: "ver", selectionStart: 0, selectionEnd: 3 }, "link").value).toBe("[ver](https://)");
  });

  it("swatches are a radio group of the five note colors with arrow keys", () => {
    renderEditor();
    const group = screen.getByRole("radiogroup", { name: "Color" });
    const radios = Array.from(group.querySelectorAll('[role="radio"]')).map((r) => r.getAttribute("aria-label"));
    expect(radios).toEqual(["Neutral", "Azul", "Ámbar", "Violeta", "Cian"]);
    for (const r of group.querySelectorAll<HTMLElement>('[role="radio"]')) {
      expect(r.getAttribute("style") ?? "").toMatch(/var\(--(muted|chart-[1-4])\)/);
    }
    expect(screen.getByRole("radio", { name: "Neutral" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Neutral" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Azul" }).getAttribute("aria-checked")).toBe("true");
  });

  it("archives with a Nota archivada toast whose Deshacer restores the note for 10 s", async () => {
    actions.archiveNoteAction.mockResolvedValue(undefined);
    actions.restoreNoteAction.mockResolvedValue(NOTE);
    const h = renderEditor({ note: NOTE });
    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(h.onArchived).toHaveBeenCalledWith(NOTE));
    expect(h.cachedNotes()).toEqual([]);
    expect(actions.archiveNoteAction).toHaveBeenCalledWith("n1");
    expect(h.onOpenChange).toHaveBeenCalledWith(false);
    const [message, options] = toastMock.mock.calls[0] as [string, { duration: number; action: { label: string; onClick(): void } }];
    expect(message).toBe("Nota archivada");
    expect(options.duration).toBe(NOTE_UNDO_MS);
    expect(NOTE_UNDO_MS).toBe(10_000);
    expect(options.action.label).toBe("Deshacer");
    options.action.onClick();
    await waitFor(() => expect(h.cachedNotes()).toEqual([NOTE]));
    expect(actions.restoreNoteAction).toHaveBeenCalledWith("n1");
  });

  it("puts an archived note back when the archive fails", async () => {
    actions.archiveNoteAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    const h = renderEditor({ note: NOTE });
    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
    expect(h.cachedNotes()).toEqual([NOTE]);
    expect(h.onArchived).not.toHaveBeenCalled();
  });

  it("Convertir en tarea opens the shared new-task dialog with the note text (source nota)", () => {
    renderEditor({ note: NOTE, canConvertToTask: true });
    fireEvent.click(screen.getByRole("button", { name: "Convertir en tarea" }));
    expect(useNewTaskUi.getState()).toMatchObject({
      open: true,
      source: "nota",
      defaults: { title: "Proveedores", description: "Llamar a Juanma\nPedir muestras", projectId: "p1" },
    });
    // No dialog of its own: the host in the app shell renders it.
    expect(screen.queryByRole("dialog", { name: "Nueva tarea" })).toBeNull();
  });

  it("has no Convertir en tarea while that flag is off", () => {
    renderEditor({ note: NOTE });
    expect(screen.queryByRole("button", { name: "Convertir en tarea" })).toBeNull();
  });

  // One axe pass per theme × mode (× style): slow on a busy machine.
  it("has no serious or critical axe violations in all three themes, light and dark", { timeout: 120_000 }, async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        const root = document.documentElement;
        root.setAttribute("data-theme", mode);
        for (const [name, value] of Object.entries(THEME_PRESETS[theme].tokens)) {
          root.style.setProperty(`--${name}`, value[mode]);
        }
        renderEditor({ note: NOTE, canConvertToTask: true });
        const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => v.id), `${theme} ${mode}`).toEqual([]);
        cleanup();
      }
    }
  });
});
