// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { Checklist, Note, NotificationsPage, PresentationStyle, Reminder } from "@/lib/types/redesign";

import type { ChecklistCardProps } from "./ChecklistCard";
import type { InboxProps } from "./Inbox";
import type { NoteEditorProps } from "./NoteEditor";
import type { NotesGridProps } from "./NotesGrid";
import type { QuickCaptureProps } from "./QuickCapture";

const ALL_ON = {
  fetchNotesAction: true,
  createNoteAction: true,
  updateNoteAction: true,
  fetchChecklistsAction: true,
  fetchRemindersAction: true,
  fetchNotificationsAction: true,
  fetchGmailStatusAction: true,
  fetchGmailThreadAction: true,
};

const flags = vi.hoisted(() => ({}) as Record<string, boolean>);
vi.mock("@/lib/actions/my-space-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: flags }));

const actions = vi.hoisted(() => ({
  fetchNotesAction: vi.fn(),
  fetchChecklistsAction: vi.fn(),
  fetchRemindersAction: vi.fn(),
}));
vi.mock("@/lib/actions/my-space-actions", () => actions);

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/mi-espacio",
}));

const params = vi.hoisted(() => ({ replaceMiEspacioParam: vi.fn() }));
vi.mock("./search-params", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./search-params")>()),
  replaceMiEspacioParam: params.replaceMiEspacioParam,
}));

// Sections owned by their own issues: stand-ins that show the data they get.
vi.mock("@/components/shell/EstiloSwitch", () => ({
  EstiloSwitch: () => <div role="radiogroup" aria-label="Estilo" />,
}));
vi.mock("./QuickCapture", () => ({
  QuickCapture: ({ onCreated }: QuickCaptureProps) => (
    <div data-testid="quick-capture">
      <button type="button" onClick={() => onCreated("nota")}>
        Capturar nota
      </button>
      <button type="button" onClick={() => onCreated("checklist")}>
        Capturar checklist
      </button>
      <button type="button" onClick={() => onCreated("recordatorio")}>
        Capturar recordatorio
      </button>
    </div>
  ),
}));
vi.mock("./Inbox", () => ({
  Inbox: ({ notifications, gmail, tab }: InboxProps) => (
    <section data-testid="inbox">
      {`bandeja:${tab}:${notifications.items.length}:${notifications.unreadCount}:${gmail?.threads.length ?? "sin-gmail"}`}
    </section>
  ),
}));
vi.mock("./NotesGrid", () => ({
  NotesGrid: ({ notes, onOpen }: NotesGridProps) => (
    <ul data-testid="notes">
      {notes.map((n) => (
        <li key={n.id}>
          <button type="button" onClick={() => onOpen(n)}>
            {n.title}
          </button>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("./NoteEditor", () => ({
  NoteEditor: ({ note, open, onOpenChange }: NoteEditorProps) =>
    open ? (
      <div role="dialog" aria-label="Nota">
        <p data-testid="editor-note">{note ? note.id : "nueva"}</p>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cerrar nota
        </button>
      </div>
    ) : null,
}));
vi.mock("./ChecklistCard", () => ({
  ChecklistCard: ({ checklist }: ChecklistCardProps) => (
    <p data-testid="checklist">{`${checklist.title}:${checklist.items.length}`}</p>
  ),
}));
vi.mock("./GmailReader", () => ({
  GmailReader: ({ threadId }: { threadId: string }) => <p data-testid="reader">{threadId}</p>,
}));

import { MiEspacioClient, type MiEspacioClientProps } from "./MiEspacioClient";

const NOW = new Date();

function note(id: string, title: string, pinned = false): Note {
  return { id, title, body: "", color: "neutral", pinned, projectId: null, updatedAt: NOW.toISOString() };
}

const NOTIFICATIONS: NotificationsPage = {
  items: [
    {
      id: "a1",
      kind: "asignacion",
      title: "Te asignaron 2 tareas",
      body: "",
      entity: null,
      entityId: null,
      url: null,
      readAt: null,
      createdAt: NOW.toISOString(),
    },
  ],
  nextCursor: null,
  unreadCount: 1,
};

const REMINDERS: Reminder[] = [
  {
    id: "r1",
    text: "Llamar a Juanma por cotas",
    dueAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    repeat: "none",
    channels: ["app"],
    taskId: null,
    projectId: null,
    firedAt: null,
    cancelledAt: null,
  },
];

const CHECKLISTS: Checklist[] = [
  {
    id: "c1",
    title: "Visita de obra",
    projectId: null,
    items: [{ id: "i1", text: "Planos", done: false, sortOrder: 0 }],
  },
];

const NOTES: Note[] = [note("n1", "Ideas recepción", true), note("n2", "Pendientes")];

function props(overrides: Partial<MiEspacioClientProps> = {}): MiEspacioClientProps {
  return {
    notifications: NOTIFICATIONS,
    gmail: { status: { connected: true, scopeOk: true, lastSyncedAt: null, lastError: null }, threads: [], nextCursor: null },
    reminders: REMINDERS,
    checklists: CHECKLISTS,
    notes: NOTES,
    noteParam: null,
    ...overrides,
  };
}

function renderClient(style: PresentationStyle = "visual", overrides: Partial<MiEspacioClientProps> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <MiEspacioClient {...props(overrides)} />
    </StyleProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(flags)) delete flags[key];
  Object.assign(flags, ALL_ON);
  nav.search = "";
});

afterEach(() => {
  cleanup();
});

describe("MiEspacioClient", () => {
  it("renders the header, the private chip, the description and the style switch", () => {
    renderClient();
    expect(screen.getByRole("heading", { level: 1, name: "Mi espacio" })).toBeTruthy();
    expect(screen.getByText("Solo tú lo ves")).toBeTruthy();
    expect(screen.getByText("Tu bandeja, notas, checklists y recordatorios.")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Estilo" })).toBeTruthy();
  });

  it("composes capture, Bandeja, Recordatorios, Checklists and Notas", () => {
    renderClient();
    expect(screen.getByTestId("quick-capture")).toBeTruthy();
    expect(screen.getByTestId("inbox").textContent).toBe("bandeja:todo:1:1:0");
    expect(screen.getByRole("heading", { name: "Recordatorios" })).toBeTruthy();
    expect(screen.getByText("Llamar a Juanma por cotas")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Checklists" })).toBeTruthy();
    expect(screen.getByTestId("checklist").textContent).toBe("Visita de obra:1");
    expect(screen.getByRole("heading", { name: "Notas" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toContain("Ideas recepción");
  });

  it("hands the same data to every section in Visual, Esencial and Analítico", () => {
    const snapshots = (["visual", "esencial", "analitico"] as const).map((style) => {
      const { container, unmount } = renderClient(style);
      const text = container.textContent;
      unmount();
      return text;
    });
    expect(snapshots[1]).toBe(snapshots[0]);
    expect(snapshots[2]).toBe(snapshots[0]);
  });

  it("reads the Bandeja tab from ?bandeja=", () => {
    nav.search = "bandeja=menciones";
    renderClient();
    expect(screen.getByTestId("inbox").textContent).toBe("bandeja:menciones:1:1:0");
  });

  it("shows the empty reminders line", () => {
    renderClient("visual", { reminders: [] });
    expect(screen.getByText("Sin recordatorios para hoy y mañana")).toBeTruthy();
  });

  it("?nota=<id> opens the editor for an own note", () => {
    nav.search = "nota=n2";
    renderClient();
    expect(screen.getByRole("dialog", { name: "Nota" })).toBeTruthy();
    expect(screen.getByTestId("editor-note").textContent).toBe("n2");
    expect(screen.queryByText("Ya no existe. Recarga la página.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar nota" }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("nota", null);
  });

  it("?nota=nueva opens an empty editor", () => {
    nav.search = "nota=nueva";
    renderClient();
    expect(screen.getByTestId("editor-note").textContent).toBe("nueva");
  });

  it("?nota=<unknown id> shows the NOT_FOUND copy and no editor", () => {
    nav.search = "nota=otra";
    renderClient();
    expect(screen.getByText("Ya no existe. Recarga la página.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("nota", null);
  });

  it("opening a note from the grid sets ?nota=<id>", () => {
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Pendientes" }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("nota", "n2");
  });

  it("?correo=<id> opens the Gmail reader", () => {
    nav.search = "correo=t1";
    renderClient();
    expect(screen.getByTestId("reader").textContent).toBe("t1");
  });

  it("refetches the captured kind's list", async () => {
    actions.fetchNotesAction.mockResolvedValue([...NOTES, note("n3", "Nueva idea")]);
    actions.fetchChecklistsAction.mockResolvedValue([]);
    actions.fetchRemindersAction.mockResolvedValue([]);
    renderClient();

    fireEvent.click(screen.getByRole("button", { name: "Capturar nota" }));
    expect(await screen.findByText("Nueva idea")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Capturar checklist" }));
    expect(await screen.findByText("Aún no tienes checklists.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Capturar recordatorio" }));
    expect(await screen.findByText("Sin recordatorios para hoy y mañana")).toBeTruthy();
    const range = actions.fetchRemindersAction.mock.calls[0][0] as { from: string; to: string };
    expect(Date.parse(range.from)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(range.to)).toBeGreaterThan(Date.now());
  });

  it("toasts the error copy when a refetch fails", async () => {
    actions.fetchNotesAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Capturar nota" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
  });

  it("stub phase: no section and no editor while the read actions are stubs", () => {
    for (const key of Object.keys(flags)) flags[key] = false;
    nav.search = "nota=n1&correo=t1";
    renderClient();
    expect(screen.getByRole("heading", { level: 1, name: "Mi espacio" })).toBeTruthy();
    expect(screen.queryByTestId("inbox")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recordatorios" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Checklists" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Notas" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("reader")).toBeNull();
    expect(screen.queryByText("Ya no existe. Recarga la página.")).toBeNull();
  });

  it("has no serious axe violations", async () => {
    const { container } = renderClient();
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
