// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { MouseEvent, ReactNode } from "react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { RecordTableProps } from "@/components/widgets/RecordTable";
import type { WidgetCardProps } from "@/components/widgets/WidgetCard";
import type { GmailThreadSummary, NotificationItem } from "@/lib/types/redesign";

/** FE §9 / §20 Rule 1: with every notifications and Gmail action still a stub, no entry point reaches a write. */
const mocks = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markRead: vi.fn(),
  linkThread: vi.fn(),
  createTask: vi.fn(),
  fetchThreads: vi.fn(),
  fetchStatus: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectOptions: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/mi-espacio",
  useSearchParams: () => new URLSearchParams("bandeja=gmail"),
}));
vi.mock("next/link", () => ({
  default: (props: { href: string; children?: ReactNode; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void } & Record<string, unknown>) => {
    const { href, children, onClick, ...rest } = props;
    delete rest.scroll;
    delete rest.prefetch;
    return (
      <a
        href={href}
        {...rest}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e);
        }}
      >
        {children}
      </a>
    );
  },
}));
vi.mock("@/lib/actions/notifications-actions", () => ({
  fetchNotificationsAction: mocks.fetchNotifications,
  markNotificationsReadAction: mocks.markRead,
}));
vi.mock("@/lib/actions/gmail-actions", () => ({
  fetchGmailStatusAction: mocks.fetchStatus,
  fetchGmailThreadsAction: mocks.fetchThreads,
  fetchGmailThreadAction: vi.fn(),
  markGmailThreadReadAction: vi.fn(),
  linkGmailThreadToProjectAction: mocks.linkThread,
  createTaskFromGmailThreadAction: mocks.createTask,
}));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectsAction: mocks.fetchProjects }));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: mocks.fetchProjectOptions,
  fetchCatalogWorkflows: vi.fn(),
  fetchCatalogTaskStatuses: vi.fn(),
  fetchCatalogStaff: vi.fn(),
  fetchCatalogAssignableStaff: vi.fn(),
  fetchCatalogProjectSpaces: vi.fn(),
  fetchCatalogContacts: vi.fn(),
}));
vi.mock("@/lib/actions/my-space-actions", () => ({ fetchRemindersAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, { get: () => false }),
}));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, { get: () => false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/widgets/WidgetCard", () => ({
  WidgetCard: (props: WidgetCardProps) => (
    <section aria-label={props.title}>
      <h2>{props.title}</h2>
      {props.actions}
      {props.children}
    </section>
  ),
}));
vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: (props: EmptyStateProps) => <p>{props.title}</p>,
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: (props: RecordTableProps) => (
    <table>
      <tbody>
        {props.data.rows.map((row) => (
          <tr key={String(row.id)}>
            <td>{props.renderCell?.("item", row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import { Inbox, INBOX_POLL_MS } from "@/components/mi-espacio/Inbox";
import { seedMiEspacio } from "@/lib/query/options/mi-espacio";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

const ITEM: NotificationItem = {
  id: "n1",
  kind: "asignacion",
  title: "Te asignaron Plano eléctrico",
  body: "",
  entity: null,
  entityId: null,
  url: "/tareas?tarea=x",
  readAt: null,
  createdAt: new Date().toISOString(),
};
const THREAD: GmailThreadSummary = {
  id: "t1",
  subject: "Cotización",
  from: "a@b.mx",
  snippet: "",
  receivedAt: new Date().toISOString(),
  unread: true,
  projectId: null,
  suggestedProjectId: "p1",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Inbox while the actions are stubs", () => {
  it("hides the Gmail tab, chip, footer and row actions, and never polls or marks read", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    seedMiEspacio(client, {
      notifications: { items: [ITEM], nextCursor: "c1", unreadCount: 1 },
      gmail: { status: { connected: true, scopeOk: true, lastSyncedAt: null, lastError: null }, threads: [THREAD], nextCursor: null },
      reminders: [],
      checklists: [],
      checklistsCursor: null,
      notes: [],
      notesCursor: null,
    });
    renderWithQueryClient(<Inbox />, { client });

    expect(screen.queryByText("Gmail")).toBeNull();
    expect(screen.queryByText(/Gmail conectado|Conectar Gmail|Ajustes de Gmail/)).toBeNull();
    expect(screen.queryByText("Cotización")).toBeNull();
    expect(screen.queryByRole("button", { name: /Crear tarea|Vincular a proyecto/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();

    // The notification still navigates, without calling the stub.
    fireEvent.click(screen.getByRole("link", { name: /Te asignaron Plano eléctrico/ }));
    expect(mocks.markRead).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_POLL_MS * 2);
    });
    expect(mocks.fetchNotifications).not.toHaveBeenCalled();
    expect(mocks.fetchStatus).not.toHaveBeenCalled();
    expect(mocks.fetchThreads).not.toHaveBeenCalled();
    expect(mocks.fetchProjects).not.toHaveBeenCalled();
    expect(mocks.fetchProjectOptions).not.toHaveBeenCalled();
  });
});
