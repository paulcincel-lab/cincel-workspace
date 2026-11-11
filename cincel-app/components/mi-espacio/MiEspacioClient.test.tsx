// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_TASKS_SEED } from "@/tests/helpers/my-tasks-seed";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { seedMiEspacio, type NotesData } from "@/lib/query/options/mi-espacio";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { MiEspacioPageData } from "@/lib/types/mi-espacio";
import { seedSessionUser } from "@/tests/helpers/session-user";
import type { Checklist, Note, NotificationsPage, PresentationStyle, Reminder } from "@/lib/types/redesign";

import type { ChecklistCardProps } from "./ChecklistCard";
import type { NoteEditorProps } from "./NoteEditor";
import type { NotesGridProps } from "./NotesGrid";

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
  fetchNotesPage: vi.fn(),
  fetchChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/my-space-actions", () => ({
  fetchNotesAction: actions.fetchNotesAction,
  fetchChecklistsAction: actions.fetchChecklistsAction,
  fetchRemindersAction: actions.fetchRemindersAction,
}));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  getMyTasksSummary: vi.fn(),
  getMyTasksPage: vi.fn(async () => ({ rows: [], nextCursor: null, total: 0 })),
  fetchMiEspacioNotesPage: actions.fetchNotesPage,
  fetchMiEspacioChecklistsPage: actions.fetchChecklistsPage,
}));
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/notifications-actions", () => ({}));

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
vi.mock("./QuickCapture", () => ({ QuickCapture: () => <div data-testid="quick-capture" /> }));
// The Bandeja reads its own queries and the URL tab (Inbox.test.tsx).
vi.mock("./Inbox", () => ({ Inbox: () => <section data-testid="inbox">bandeja</section> }));
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
// The Visual layout has its own tests (components/widgets/MiEspacioBoard.test.tsx).
vi.mock("@/components/widgets/MiEspacioBoard", () => ({
  MiEspacioBoard: ({ notice, reader }: { notice?: ReactNode; reader?: ReactNode }) => (
    <div data-testid="visual-board">
      {notice}
      {reader}
    </div>
  ),
}));
// The Analítico layout has its own tests (components/widgets/__tests__/MiEspacioAnalitico.test.tsx).
vi.mock("@/components/widgets/MiEspacioAnalitico", () => ({
  MiEspacioAnalitico: ({ notice, reader }: { notice?: ReactNode; reader?: ReactNode }) => (
    <div data-testid="analitico-layout">
      {notice}
      {reader}
    </div>
  ),
}));
vi.mock("./GmailReader", () => ({
  GmailReader: ({ threadId }: { threadId: string }) => <p data-testid="reader">{threadId}</p>,
}));
// The Esencial layout reads my tasks and opens the task sheet (MiEspacioEsencial.test.tsx covers them).
vi.mock("@/lib/actions/tasks-actions", () => ({
  setTaskStatusAction: vi.fn(),
  createUserTaskAction: vi.fn(),
  deleteTaskAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({ fetchCatalogProjectOptions: vi.fn(async () => []) }));
vi.mock("@/components/tareas/TaskSheet", () => ({ TaskSheetRoute: () => null, taskSheetHref: () => "/mi-espacio" }));
vi.mock("@/components/tareas/NewTaskDialog", () => ({ newTaskInvalidations: () => [] }));

import { MiEspacioClient, type MiEspacioClientProps } from "./MiEspacioClient";
// The client loads each style's layout on demand; the real Esencial layout
// (not mocked) is loaded up front so its chunk resolves at once in the tests.
import "@/components/widgets/MiEspacioEsencial";

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
    projectName: null,
    updatedAt: "2026-11-01T12:00:00.000Z",
    items: [{ id: "i1", text: "Planos", done: false, sortOrder: 0 }],
  },
];

const NOTES: Note[] = [note("n1", "Ideas recepción", true), note("n2", "Pendientes")];

function pageData(overrides: Partial<MiEspacioPageData> = {}): MiEspacioPageData {
  return {
    notifications: NOTIFICATIONS,
    gmail: { status: { connected: true, scopeOk: true, lastSyncedAt: null, lastError: null }, threads: [], nextCursor: null },
    reminders: REMINDERS,
    checklists: CHECKLISTS,
    checklistsCursor: null,
    notes: NOTES,
    notesCursor: null,
    tasks: NO_TASKS_SEED,
    canCreateTask: true,
    ...overrides,
  };
}

/** As the page renders it: the page data seeded into the granular keys, then the client under them. */
function renderClient(
  style: PresentationStyle = "analitico",
  overrides: Partial<MiEspacioPageData> = {},
  clientProps: Partial<MiEspacioClientProps> = {},
) {
  const client = createTestQueryClient();
  seedMiEspacio(client, pageData(overrides));
  const view = renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <MiEspacioClient noteParam={null} {...clientProps} />
    </StyleProvider>,
    { client },
  );
  return { ...view, client };
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
  it("Analítico renders its layout with the shared notice and reader", async () => {
    nav.search = "correo=t1";
    renderClient("analitico");
    expect(await screen.findByTestId("analitico-layout")).toBeTruthy();
    expect(screen.getByTestId("reader").textContent).toBe("t1");
    expect(screen.queryByTestId("visual-board")).toBeNull();
  });

  it("Visual renders the Mi espacio board instead of the sections", async () => {
    nav.search = "correo=t1";
    renderClient("visual");
    expect(await screen.findByTestId("visual-board")).toBeTruthy();
    expect(screen.getByTestId("reader").textContent).toBe("t1");
    expect(screen.queryByTestId("quick-capture")).toBeNull();
  });

  it("reads every list from its query, with no fetch on mount", () => {
    renderClient();
    expect(actions.fetchNotesAction).not.toHaveBeenCalled();
    expect(actions.fetchChecklistsAction).not.toHaveBeenCalled();
    expect(actions.fetchRemindersAction).not.toHaveBeenCalled();
    expect(actions.fetchNotesPage).not.toHaveBeenCalled();
    expect(actions.fetchChecklistsPage).not.toHaveBeenCalled();
  });

  it("a cache write shows at once (no local copy of the lists)", async () => {
    nav.search = "nota=n3";
    const { client } = renderClient();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      client.setQueryData<NotesData>(qk.me.notes(), (old) => ({
        ...old!,
        pages: [{ ...old!.pages[0]!, items: [note("n3", "Nueva idea"), ...old!.pages[0]!.items] }],
      }));
    });
    expect((await screen.findByTestId("editor-note")).textContent).toBe("n3");
    const src = readFileSync(join(__dirname, "MiEspacioClient.tsx"), "utf8");
    // `IMPLEMENTED.<action>` flag lookups gate the queries; the actions themselves are never called here.
    expect(src).not.toMatch(
      /useSyncedList|router\.refresh|(?<!IMPLEMENTED\.)\b(?:fetchNotesAction|fetchChecklistsAction|fetchRemindersAction)\b/,
    );
  });

  it("?nota=<id> of a note past the first page loads pages until it shows up", async () => {
    actions.fetchNotesPage.mockResolvedValue({ items: [note("n9", "Nota antigua")], nextCursor: null });
    nav.search = "nota=n9";
    renderClient("analitico", { notesCursor: "24" });
    expect(await screen.findByTestId("editor-note")).toBeTruthy();
    expect(screen.getByTestId("editor-note").textContent).toBe("n9");
    expect(actions.fetchNotesPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ya no existe. Recarga la página.")).toBeNull();
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

  it("?nota=<unknown id> shows the NOT_FOUND copy and no editor", async () => {
    nav.search = "nota=otra";
    renderClient();
    expect(await screen.findByText("Ya no existe. Recarga la página.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(params.replaceMiEspacioParam).toHaveBeenCalledWith("nota", null);
  });

  it("?correo=<id> opens the Gmail reader", async () => {
    nav.search = "correo=t1";
    renderClient();
    expect((await screen.findByTestId("reader")).textContent).toBe("t1");
  });

  it("stub phase: no section and no editor while the read actions are stubs", async () => {
    for (const key of Object.keys(flags)) flags[key] = false;
    nav.search = "nota=n1&correo=t1";
    renderClient();
    expect(await screen.findByTestId("analitico-layout")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("reader")).toBeNull();
    expect(screen.queryByText("Ya no existe. Recarga la página.")).toBeNull();
  });

  it("Esencial: header copy and greeting", async () => {
    seedSessionUser({ member: { id: "me", name: "Ana López" }, access: "Colaborador" });
    renderClient("esencial");
    expect(await screen.findByRole("heading", { level: 1, name: "Mi espacio" })).toBeTruthy();
    expect(screen.getByText("Solo tú lo ves")).toBeTruthy();
    expect(screen.getByText(/^Buen(?:os días|as tardes|as noches), Ana\. Tu día en un vistazo\.$/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nueva nota" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Captura rápida" })).toBeTruthy();
    // The capture bar lives in the header popover in this style.
    expect(screen.queryByTestId("quick-capture")).toBeNull();
    expect(screen.getByRole("heading", { name: "Mis tareas" })).toBeTruthy();
  });

  it("has no serious axe violations", async () => {
    const { container } = renderClient();
    await screen.findByTestId("analitico-layout");
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
