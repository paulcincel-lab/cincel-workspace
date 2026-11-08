// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { MouseEvent, ReactNode } from "react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { RecordTableProps } from "@/components/widgets/RecordTable";
import type { WidgetCardProps } from "@/components/widgets/WidgetCard";
import type { GmailThreadSummary, NotificationItem, PresentationStyle } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markRead: vi.fn(),
  fetchThreads: vi.fn(),
  linkThread: vi.fn(),
  createTask: vi.fn(),
  fetchProjects: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  push: vi.fn(),
  style: { current: "visual" as PresentationStyle },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/mi-espacio",
  useSearchParams: () => new URLSearchParams(),
}));
// Plain anchors: clicks run the handlers without a router navigation.
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
  fetchGmailThreadsAction: mocks.fetchThreads,
  linkGmailThreadToProjectAction: mocks.linkThread,
  createTaskFromGmailThreadAction: mocks.createTask,
}));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectsAction: mocks.fetchProjects }));
// The owning phase flips these; the Bandeja behavior is tested with them on.
vi.mock("@/lib/actions/notifications-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, { get: () => true }),
}));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, { get: () => true }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

/** Contract stand-ins for the library widgets and shell states: plain markup from their props. */
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
  EmptyState: (props: EmptyStateProps) => (
    <div data-testid="empty-state">
      <p>{props.title}</p>
      {props.description ? <p>{props.description}</p> : null}
      {props.action?.href ? <a href={props.action.href}>{props.action.label}</a> : null}
    </div>
  ),
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: (props: RecordTableProps) => {
    const columns = props.data.columns.filter((c) => !c.hideOn?.includes(mocks.style.current));
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
          {props.data.rows.map((row) => (
            <tr key={String(row.id)} data-testid={`row-${String(row.id)}`}>
              {columns.map((c) => (
                <td key={c.key}>{props.renderCell?.(c.key, row) ?? String(row[c.key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { Inbox, INBOX_POLL_MS, type InboxProps } from "@/components/mi-espacio/Inbox";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { ShellBadges } from "@/lib/types/shell";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function notification(over: Partial<NotificationItem> & { id: string }): NotificationItem {
  return {
    kind: "asignacion",
    title: `Aviso ${over.id}`,
    body: "",
    entity: null,
    entityId: null,
    url: `/tareas?tarea=${over.id}`,
    readAt: null,
    createdAt: minutesAgo(10),
    ...over,
  };
}

const N_ASSIGN = notification({ id: "n1", title: "Te asignaron Plano eléctrico", createdAt: minutesAgo(3) });
const N_MENTION = notification({
  id: "n2",
  kind: "mencion",
  title: "Luis te mencionó en Cocina",
  body: "@ana revisa el plano",
  createdAt: minutesAgo(8),
});
const N_READ = notification({ id: "n3", kind: "comentario", title: "Nuevo comentario", readAt: minutesAgo(1), createdAt: minutesAgo(30) });

const T_UNREAD: GmailThreadSummary = {
  id: "t1",
  subject: "Cotización Casa Lomas",
  from: "Juanma Ruiz <juanma@proveedor.mx>",
  snippet: "Te comparto la cotización",
  receivedAt: minutesAgo(5),
  unread: true,
  projectId: null,
  suggestedProjectId: "p1",
};
const T_READ: GmailThreadSummary = {
  id: "t2",
  subject: "Factura octubre",
  from: "conta@cincel.mx",
  snippet: "Adjunto la factura",
  receivedAt: minutesAgo(60),
  unread: false,
  projectId: null,
  suggestedProjectId: null,
};

const CONNECTED = { connected: true, scopeOk: true, lastSyncedAt: minutesAgo(5), lastError: null };

function baseProps(over: Partial<InboxProps> = {}): InboxProps {
  return {
    notifications: { items: [N_ASSIGN, N_MENTION, N_READ], nextCursor: null, unreadCount: 2 },
    gmail: { status: CONNECTED, threads: [T_UNREAD, T_READ], nextCursor: null },
    tab: "todo",
    ...over,
  };
}

/** The cache the shell hydrates; the Inbox patches its `shell.badges` unread count. */
let client: QueryClient = createTestQueryClient();

/** The Mi espacio badge's unread count, as the sidebar reads it. */
function readBandejaUnread(): number | undefined {
  return client.getQueryData<ShellBadges>(qk.shell.badges())?.bandeja.unreadCount;
}

function withClient(ui: ReactNode) {
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function renderInbox(over: Partial<InboxProps> = {}, style: PresentationStyle = "visual") {
  mocks.style.current = style;
  return render(
    withClient(
      <StyleProvider style={style} scope="staff">
        <Inbox {...baseProps(over)} />
      </StyleProvider>,
    ),
  );
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  mocks.fetchProjects.mockResolvedValue([
    { id: "p1", name: "Casa Lomas", status: "activo" },
    { id: "p2", name: "Depto Roma", status: "activo" },
  ]);
  mocks.fetchNotifications.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 2 });
  mocks.markRead.mockResolvedValue({ unreadCount: 1 });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  client = createTestQueryClient();
  client.setQueryData<ShellBadges>(qk.shell.badges(), { tareasOpen: 0, bandeja: { unreadCount: 2, dueReminders: [] } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  client.clear();
});

describe("Inbox tabs and counts", () => {
  it("shows the four tabs as links with their unread counts", () => {
    renderInbox();
    const nav = screen.getByRole("navigation", { name: "Pestañas de la bandeja" });
    for (const label of ["Todo", "Gmail", "Notificaciones", "Menciones"]) {
      expect(within(nav).getByText(label).closest("a")).not.toBeNull();
    }
    expect(screen.getByTestId("inbox-count-todo").textContent).toContain("3");
    expect(screen.getByTestId("inbox-count-gmail").textContent).toContain("1");
    expect(screen.getByTestId("inbox-count-notificaciones").textContent).toContain("2");
    expect(screen.getByTestId("inbox-count-menciones").textContent).toContain("1");
    expect(within(nav).getByText("Todo").closest("a")?.getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByText("Gmail").closest("a")?.getAttribute("href")).toBe("/mi-espacio?bandeja=gmail");
  });

  it("Todo merges notifications and Gmail threads, newest first", () => {
    renderInbox();
    const ids = screen.getAllByTestId(/^row-/).map((r) => r.getAttribute("data-testid"));
    expect(ids).toEqual(["row-n:n1", "row-g:t1", "row-n:n2", "row-n:n3", "row-g:t2"]);
  });

  it("Menciones lists only mention notifications", () => {
    renderInbox({ tab: "menciones" });
    expect(screen.getByText("Luis te mencionó en Cocina")).toBeTruthy();
    expect(screen.queryByText("Te asignaron Plano eléctrico")).toBeNull();
    expect(screen.queryByText("Cotización Casa Lomas")).toBeNull();
  });

  it("clicking a tab filters the rows", () => {
    renderInbox();
    fireEvent.click(within(screen.getByRole("navigation")).getByText("Notificaciones"));
    expect(screen.queryByText("Cotización Casa Lomas")).toBeNull();
    expect(screen.getByText("Te asignaron Plano eléctrico")).toBeTruthy();
  });

  it("the Gmail tab shows Conectar Gmail when Gmail is not connected", () => {
    renderInbox({
      tab: "gmail",
      gmail: { status: { connected: false, scopeOk: false, lastSyncedAt: null, lastError: null }, threads: [], nextCursor: null },
    });
    const empty = screen.getByTestId("empty-state");
    expect(within(empty).getByText("Conectar Gmail", { selector: "p" })).toBeTruthy();
    expect(within(empty).getByRole("link", { name: "Conectar Gmail" }).getAttribute("href")).toBe("/ajustes/integraciones");
  });
});

describe("Gmail status chip and footer", () => {
  it("shows the sync time when connected", () => {
    renderInbox();
    expect(screen.getByText("Gmail conectado · sincronizado hace 5 min")).toBeTruthy();
    expect(screen.getByText("Los correos con el nombre de un proyecto se sugieren para vincular.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ajustes de Gmail" }).getAttribute("href")).toBe("/ajustes/integraciones");
  });

  it("links to Ajustes › Integraciones when not connected", () => {
    renderInbox({ gmail: null });
    const links = screen.getAllByRole("link", { name: "Conectar Gmail" });
    expect(links[0].getAttribute("href")).toBe("/ajustes/integraciones");
    expect(screen.queryByText(/Gmail conectado/)).toBeNull();
    expect(screen.queryByText("Cotización Casa Lomas")).toBeNull();
  });

  it("asks to reconnect when the Gmail scope is missing", () => {
    renderInbox({
      gmail: { status: { connected: true, scopeOk: false, lastSyncedAt: null, lastError: null }, threads: [T_UNREAD], nextCursor: null },
    });
    expect(screen.getByRole("link", { name: "Conectar Gmail" })).toBeTruthy();
    expect(screen.queryByText("Cotización Casa Lomas")).toBeNull();
  });
});

describe("Inbox mark read", () => {
  it("clicking a notification marks it read, drops the unread weight and updates the badge", async () => {
    renderInbox();
    const link = screen.getByRole("link", { name: /Te asignaron Plano eléctrico/ });
    expect(link.getAttribute("href")).toBe("/tareas?tarea=n1");
    expect(link.className).toContain("font-semibold");

    fireEvent.click(link);

    expect(mocks.markRead).toHaveBeenCalledWith(["n1"]);
    await waitFor(() => expect(readBandejaUnread()).toBe(1));
    const after = screen.getByRole("link", { name: /Te asignaron Plano eléctrico/ });
    expect(after.className).not.toContain("font-semibold");
    expect(screen.getByTestId("inbox-count-notificaciones").textContent).toContain("1");
  });

  it("does not call the action again for a read notification", () => {
    renderInbox();
    fireEvent.click(screen.getByRole("link", { name: "Nuevo comentario" }));
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("rolls back and shows the error copy when marking fails", async () => {
    mocks.markRead.mockRejectedValueOnce(new Error("FORBIDDEN"));
    renderInbox();
    fireEvent.click(screen.getByRole("link", { name: /Te asignaron Plano eléctrico/ }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    expect(screen.getByRole("link", { name: /Te asignaron Plano eléctrico/ }).className).toContain("font-semibold");
    expect(readBandejaUnread()).toBe(2);
  });
});

describe("Inbox polling", () => {
  it("polls every 60 s while visible, pauses when hidden and updates the sidebar badge", async () => {
    vi.useFakeTimers();
    const fresh = notification({ id: "n9", title: "Recordatorio: llamar a Juanma", kind: "recordatorio", createdAt: new Date().toISOString() });
    mocks.fetchNotifications.mockResolvedValue({ items: [N_ASSIGN, N_MENTION, fresh], nextCursor: null, unreadCount: 3 });
    renderInbox();

    expect(mocks.fetchNotifications).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_POLL_MS);
    });
    expect(mocks.fetchNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.fetchNotifications).toHaveBeenCalledWith({ unreadOnly: true });
    expect(screen.getByText("Recordatorio: llamar a Juanma")).toBeTruthy();
    expect(readBandejaUnread()).toBe(3);
    expect(screen.getByTestId("inbox-count-notificaciones").textContent).toContain("3");

    await act(async () => {
      setVisibility("hidden");
      await vi.advanceTimersByTimeAsync(INBOX_POLL_MS * 3);
    });
    expect(mocks.fetchNotifications).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.fetchNotifications).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_POLL_MS);
    });
    expect(mocks.fetchNotifications).toHaveBeenCalledTimes(3);
  });

  it("does not start polling while the document is hidden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    renderInbox();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_POLL_MS * 2);
    });
    expect(mocks.fetchNotifications).not.toHaveBeenCalled();
  });

  it("marks loaded rows read when a complete unread page no longer has them", async () => {
    vi.useFakeTimers();
    mocks.fetchNotifications.mockResolvedValue({ items: [N_MENTION], nextCursor: null, unreadCount: 1 });
    renderInbox();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INBOX_POLL_MS);
    });
    expect(screen.getByRole("link", { name: /Te asignaron Plano eléctrico/ }).className).not.toContain("font-semibold");
  });
});

describe("Inbox load more", () => {
  it("loads the next notifications page and the next Gmail page by cursor", async () => {
    mocks.fetchNotifications.mockResolvedValueOnce({
      items: [notification({ id: "n7", title: "Aviso viejo", createdAt: minutesAgo(600) })],
      nextCursor: null,
      unreadCount: 3,
    });
    mocks.fetchThreads.mockResolvedValueOnce({ threads: [{ ...T_READ, id: "t8", subject: "Correo viejo", receivedAt: minutesAgo(700) }], nextCursor: null });
    renderInbox({
      notifications: { items: [N_ASSIGN], nextCursor: "c1", unreadCount: 2 },
      gmail: { status: CONNECTED, threads: [T_UNREAD], nextCursor: "g1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(screen.getByText("Correo viejo")).toBeTruthy());
    expect(mocks.fetchNotifications).toHaveBeenCalledWith({ cursor: "c1" });
    expect(mocks.fetchThreads).toHaveBeenCalledWith({ cursor: "g1" });
    expect(screen.getByText("Aviso viejo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });
});

describe("Inbox Gmail rows", () => {
  it("opens the reader for a Gmail row", () => {
    const onOpenThread = vi.fn();
    mocks.style.current = "visual";
    render(
      withClient(
        <StyleProvider style="visual" scope="staff">
          <Inbox {...baseProps()} onOpenThread={onOpenThread} />
        </StyleProvider>,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Cotización Casa Lomas/ }));
    expect(onOpenThread).toHaveBeenCalledWith("t1");
  });

  it("without a handler, opening a thread sets ?correo= on the URL", () => {
    window.history.replaceState(null, "", "/mi-espacio");
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: /Cotización Casa Lomas/ }));
    expect(window.location.search).toBe("?correo=t1");
  });

  it("shows the suggested-project chip and both actions", async () => {
    renderInbox();
    const row = screen.getByTestId("row-g:t1");
    expect(await within(row).findByText("Sugerido: Casa Lomas")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Crear tarea" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Vincular a proyecto" })).toBeTruthy();
    // Notification rows have no Gmail actions.
    expect(within(screen.getByTestId("row-n:n1")).queryByRole("button", { name: "Crear tarea" })).toBeNull();
  });

  it("linking shows the bitácora note first, then links to the chosen project", async () => {
    mocks.linkThread.mockResolvedValueOnce(undefined);
    renderInbox();
    const row = screen.getByTestId("row-g:t1");
    fireEvent.click(within(row).getByRole("button", { name: "Vincular a proyecto" }));

    const panel = screen.getByRole("group", { name: "Vincular a proyecto" });
    expect(within(panel).getByText("El asunto del correo quedará en la bitácora del proyecto.")).toBeTruthy();
    expect(mocks.linkThread).not.toHaveBeenCalled();

    await waitFor(() => expect(within(panel).getByRole("button", { name: "Vincular" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(within(panel).getByRole("button", { name: "Vincular" }));
    await waitFor(() => expect(mocks.linkThread).toHaveBeenCalledWith("t1", "p1"));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Correo vinculado a Casa Lomas"));
    expect(screen.queryByRole("group", { name: "Vincular a proyecto" })).toBeNull();
    expect(within(screen.getByTestId("row-g:t1")).getByRole("link", { name: "Casa Lomas" }).getAttribute("href")).toBe(
      "/proyectos/p1",
    );
  });

  it("shows a link error inline with the FE §9 copy", async () => {
    mocks.linkThread.mockRejectedValueOnce(new Error("FORBIDDEN"));
    renderInbox();
    fireEvent.click(within(screen.getByTestId("row-g:t1")).getByRole("button", { name: "Vincular a proyecto" }));
    const panel = screen.getByRole("group", { name: "Vincular a proyecto" });
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Vincular" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(within(panel).getByRole("button", { name: "Vincular" }));
    expect(await within(panel).findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });

  it("creates a task from a thread in the picked project", async () => {
    mocks.createTask.mockResolvedValueOnce({ taskId: "k1" });
    renderInbox();
    fireEvent.click(within(screen.getByTestId("row-g:t1")).getByRole("button", { name: "Crear tarea" }));
    const panel = screen.getByRole("group", { name: "Crear tarea" });
    expect((within(panel).getByLabelText("Título") as HTMLInputElement).value).toBe("Cotización Casa Lomas");
    fireEvent.change(within(panel).getByLabelText("Título"), { target: { value: "Revisar cotización" } });
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Crear tarea" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(within(panel).getByRole("button", { name: "Crear tarea" }));
    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith("t1", { projectId: "p1", title: "Revisar cotización" }),
    );
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    const [message, options] = mocks.toastSuccess.mock.calls[0] as [string, { action: { onClick(): void } }];
    expect(message).toBe("Tarea creada");
    options.action.onClick();
    expect(mocks.push).toHaveBeenCalledWith("/tareas?tarea=k1");
  });
});

describe("Inbox empty state", () => {
  it("renders Todo al día when there is nothing", () => {
    renderInbox({ notifications: { items: [], nextCursor: null, unreadCount: 0 }, gmail: { status: CONNECTED, threads: [], nextCursor: null } });
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByText("No tienes notificaciones ni correos sin leer.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders Todo al día above the read rows when nothing is unread", () => {
    renderInbox({ notifications: { items: [N_READ], nextCursor: null, unreadCount: 0 }, gmail: { status: CONNECTED, threads: [T_READ], nextCursor: null } });
    expect(screen.getByText("Todo al día")).toBeTruthy();
    expect(screen.getByText("Nuevo comentario")).toBeTruthy();
  });
});

describe("Inbox presentation styles", () => {
  const SUBJECTS = ["Te asignaron Plano eléctrico", "Luis te mencionó en Cocina", "Nuevo comentario", "Cotización Casa Lomas", "Factura octubre"];

  it.each(["visual", "esencial", "analitico"] as const)("%s renders the same rows through RecordTable", (style) => {
    renderInbox({}, style);
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(5);
    for (const subject of SUBJECTS) expect(screen.getAllByText(subject).length).toBeGreaterThan(0);
  });

  it("Analítico shows the Origen, De, Asunto, Proyecto, Recibido and Estado columns", () => {
    renderInbox({}, "analitico");
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Origen", "De", "Asunto", "Proyecto", "Recibido", "Estado"]);
    const row = screen.getByTestId("row-g:t1");
    expect(within(row).getByText("Gmail")).toBeTruthy();
    expect(within(row).getByText("Juanma Ruiz")).toBeTruthy();
    expect(within(row).getByText("Sin leer")).toBeTruthy();
  });

  it("Visual rows carry the source chip; Esencial rows have none", () => {
    renderInbox({}, "visual");
    expect(within(screen.getByTestId("row-g:t1")).getByText("Gmail")).toBeTruthy();
    cleanup();
    renderInbox({}, "esencial");
    const row = screen.getByTestId("row-g:t1");
    expect(row.querySelector("[data-slot=badge]")).toBeNull();
  });

  it("does not branch on style or import StyleView (FE §18 item 15)", () => {
    const src = readFileSync(join(__dirname, "Inbox.tsx"), "utf8");
    expect(src).not.toMatch(/StyleView|useStyle/);
    expect(src).not.toMatch(/font-(bold|extrabold|black)/);
  });
});

describe("Inbox accessibility", () => {
  it("text colors pass checkContrast in every theme, light and dark", () => {
    const used = new Set([
      "foreground/card",
      "muted-foreground/card",
      "secondary-foreground/secondary",
      "destructive/card",
      ...[1, 2, 3, 4, 5].map((n) => `chart-${n}-ink/chart-${n}-tint`),
    ]);
    expect(CONTRAST_PAIRS.filter((p) => used.has(p.pair))).toHaveLength(used.size);
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        for (const r of checkContrast(THEME_PRESETS[theme].tokens, mode).filter((x) => used.has(x.pair))) {
          expect(r.ok, `${theme} ${mode} ${r.pair}`).toBe(true);
        }
      }
    }
  });

  // One axe pass per theme × mode (× style): slow on a busy machine.
  it("has no serious or critical axe violations in all three themes and styles, light and dark", { timeout: 120_000 }, async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        for (const style of ["visual", "esencial", "analitico"] as const) {
          const root = document.documentElement;
          root.setAttribute("data-theme", mode);
          for (const [name, value] of Object.entries(THEME_PRESETS[theme].tokens)) {
            root.style.setProperty(`--${name}`, value[mode]);
          }
          renderInbox({}, style);
          const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
          const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          expect(bad.map((v) => v.id), `${theme} ${mode} ${style}`).toEqual([]);
          cleanup();
        }
      }
    }
  });
});
