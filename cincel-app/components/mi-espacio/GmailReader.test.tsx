// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type * as ReactTypes from "react";
import axe from "axe-core";

import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_IDS } from "@/lib/ui/themes";

const actions = vi.hoisted(() => ({
  fetchGmailStatusAction: vi.fn(),
  fetchGmailThreadsAction: vi.fn(),
  fetchGmailThreadAction: vi.fn(),
  markGmailThreadReadAction: vi.fn(),
  linkGmailThreadToProjectAction: vi.fn(),
  createTaskFromGmailThreadAction: vi.fn(),
  createGmailDraftAction: vi.fn(),
  sendGmailDraftAction: vi.fn(),
}));
vi.mock("@/lib/actions/gmail-actions", () => actions);

// Project names come from the light catalog (`catalog.projectOptions`), never the full portfolio.
const catalog = vi.hoisted(() => ({
  fetchCatalogProjectOptions: vi.fn(),
  fetchCatalogWorkflows: vi.fn(),
  fetchCatalogTaskStatuses: vi.fn(),
  fetchCatalogStaff: vi.fn(),
  fetchCatalogAssignableStaff: vi.fn(),
  fetchCatalogProjectSpaces: vi.fn(),
  fetchCatalogContacts: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => catalog);
vi.mock("@/lib/actions/my-space-actions", () => ({ fetchRemindersAction: vi.fn() }));
vi.mock("@/lib/actions/notifications-actions", () => ({ fetchNotificationsAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({
  getMiEspacioPageData: vi.fn(),
  fetchMiEspacioNotesPage: vi.fn(),
  fetchMiEspacioChecklistsPage: vi.fn(),
}));

const flags = vi.hoisted(() => ({
  IMPLEMENTED: {
    fetchGmailStatusAction: true,
    fetchGmailThreadsAction: true,
    fetchGmailThreadAction: true,
    syncGmailAction: true,
    linkGmailThreadToProjectAction: true,
    createGmailDraftAction: true,
    sendGmailDraftAction: true,
    createTaskFromGmailThreadAction: true,
    disconnectGmailAction: true,
  } as Record<string, boolean>,
}));
vi.mock("@/lib/actions/gmail-actions.flags", () => flags);

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/patterns/FormSheet", async () => {
  const shells = await import("@/tests/unit/fixtures/form-shells");
  return { FormSheet: shells.TestFormSheet };
});
vi.mock("@/components/patterns/FormDialog", async () => {
  const shells = await import("@/tests/unit/fixtures/form-shells");
  return { FormDialog: shells.TestFormDialog };
});

// A native <select> stands in for the popup Select so tests can pick options.
vi.mock("@/components/ui/shadcn/select", async () => {
  const React = await import("react");
  function Select({
    items,
    value,
    disabled,
    onValueChange,
    children,
  }: {
    items?: Record<string, string>;
    value?: string | null;
    disabled?: boolean;
    onValueChange?: (v: string | null) => void;
    children?: ReactTypes.ReactNode;
  }) {
    let label: string | undefined;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement<{ "aria-label"?: string }>(child) && child.props["aria-label"]) {
        label = child.props["aria-label"];
      }
    });
    return (
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onValueChange?.(e.target.value || null)}
      >
        <option value="">—</option>
        {Object.entries(items ?? {}).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    );
  }
  const Empty = () => null;
  return { Select, SelectTrigger: Empty, SelectValue: Empty, SelectContent: Empty, SelectItem: Empty };
});

import { EMAIL_IFRAME_SANDBOX, GmailReader, LINK_NOTE } from "./GmailReader";

const TRACKER = "https://tracker.example.com/open.png";

function threadData() {
  return {
    thread: {
      id: "th-1",
      subject: "Cambios en la planta baja",
      from: "Juanma Ensenada <juanma@ensenada.mx>",
      snippet: "Te mando las cotas corregidas…",
      receivedAt: "2026-11-06T16:42:00.000Z",
      unread: false,
      projectId: null,
      suggestedProjectId: "p-ens",
    },
    messages: [
      {
        id: "m-1",
        from: "Juanma Ensenada <juanma@ensenada.mx>",
        to: ["Alejandro Riofrio <alejandro@cincel.mx>"],
        cc: [],
        date: "2026-11-06T16:42:00.000Z",
        html: `<p>Hola Alejandro,</p><p>Te mando las cotas corregidas.</p><img src="${TRACKER}" alt=""><img src="data:image/png;base64,iVBORw0KGgo=" alt="firma">`,
        text: "Hola Alejandro, te mando las cotas corregidas.",
      },
    ],
    attachments: [
      { messageId: "m-1", attachmentId: "a-1", name: "Cotas cocina rev3.pdf", mime: "application/pdf", size: 1258291 },
      { messageId: "m-1", attachmentId: "a/2", name: "Fachada interior.jpg", mime: "image/jpeg", size: 3565158 },
    ],
  };
}

const PROJECTS = [
  { id: "p-ens", name: "Ensenada", status: "activo", currentWorkflowId: null },
  { id: "p-plz", name: "Platzi", status: "activo", currentWorkflowId: null },
];

beforeEach(() => {
  for (const key of Object.keys(flags.IMPLEMENTED)) flags.IMPLEMENTED[key] = true;
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.fetchGmailThreadAction.mockResolvedValue(threadData());
  actions.linkGmailThreadToProjectAction.mockResolvedValue(undefined);
  actions.createTaskFromGmailThreadAction.mockResolvedValue({ taskId: "task-1" });
  actions.markGmailThreadReadAction.mockResolvedValue({ ok: true, data: undefined });
  catalog.fetchCatalogProjectOptions.mockReset();
  catalog.fetchCatalogProjectOptions.mockResolvedValue(PROJECTS);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

async function renderReader(client = createTestQueryClient()) {
  const onClose = vi.fn();
  const view = renderWithQueryClient(<GmailReader threadId="th-1" onClose={onClose} />, { client });
  await screen.findByRole("heading", { name: "Cambios en la planta baja" });
  return { onClose, ...view, client };
}

function unreadThread() {
  const data = threadData();
  return { ...data, thread: { ...data.thread, unread: true } };
}

function bodyFrame(): HTMLIFrameElement {
  return screen.getByTitle("Contenido del correo de Juanma Ensenada") as HTMLIFrameElement;
}

describe("GmailReader", () => {
  it("loads the thread and shows its headers", async () => {
    await renderReader();
    expect(actions.fetchGmailThreadAction).toHaveBeenCalledWith("th-1");
    expect(actions.fetchGmailThreadAction).toHaveBeenCalledTimes(1);
    const article = screen.getByRole("article", { name: "Mensaje de Juanma Ensenada" });
    expect(article.textContent).toContain("para Alejandro Riofrio");
    expect(article.querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-06T16:42:00.000Z");
    expect(article.querySelector("time")?.textContent).toBe(article.querySelector("time")?.textContent?.toLowerCase());
  });

  it("an unread thread sends exactly one markGmailThreadReadAction and shows as read in the cache", async () => {
    actions.fetchGmailThreadAction.mockResolvedValue(unreadThread());
    const { client, rerender } = await renderReader();
    await waitFor(() => expect(actions.markGmailThreadReadAction).toHaveBeenCalledTimes(1));
    expect(actions.markGmailThreadReadAction).toHaveBeenCalledWith("th-1");
    const cached = client.getQueryData<{ thread: { unread: boolean } }>(["me", "gmail", "thread", "th-1"]);
    expect(cached?.thread.unread).toBe(false);

    rerender(<GmailReader threadId="th-1" onClose={vi.fn()} />);
    await Promise.resolve();
    expect(actions.markGmailThreadReadAction).toHaveBeenCalledTimes(1);
    expect(actions.fetchGmailThreadAction).toHaveBeenCalledTimes(1);
  });

  it("a thread already read sends no mark-read", async () => {
    await renderReader();
    await Promise.resolve();
    expect(actions.markGmailThreadReadAction).not.toHaveBeenCalled();
  });

  it("puts the unread mark back when mark-read fails, without an error toast", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast.error).mockClear();
    actions.fetchGmailThreadAction.mockResolvedValue(unreadThread());
    actions.markGmailThreadReadAction.mockResolvedValue({ ok: false, error: "NOT_CONNECTED" });
    const { client } = await renderReader();
    await waitFor(() => expect(actions.markGmailThreadReadAction).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(client.getQueryData<{ thread: { unread: boolean } }>(["me", "gmail", "thread", "th-1"])?.thread.unread).toBe(
        true,
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reopening within the stale time makes no call", async () => {
    const client = createTestQueryClient();
    await renderReader(client);
    cleanup();
    await renderReader(client);
    expect(actions.fetchGmailThreadAction).toHaveBeenCalledTimes(1);
    expect(catalog.fetchCatalogProjectOptions).toHaveBeenCalledTimes(1);
  });

  it("renders the body only inside a sandboxed iframe without scripts or same-origin", async () => {
    await renderReader();
    const frame = bodyFrame();
    const sandbox = frame.getAttribute("sandbox");
    expect(sandbox).not.toBeNull();
    expect(sandbox).toBe(EMAIL_IFRAME_SANDBOX);
    expect(sandbox).not.toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toContain("Te mando las cotas corregidas.");
    // The message HTML is never part of the app document itself.
    expect(screen.queryByText("Te mando las cotas corregidas.")).toBeNull();
  });

  it("blocks remote images until Mostrar imágenes is pressed", async () => {
    await renderReader();
    const blocked = bodyFrame().getAttribute("srcdoc") ?? "";
    expect(blocked).toContain("img-src data: cid:;");
    expect(blocked).not.toContain(` src="${TRACKER}"`);
    expect(blocked).toContain(`data-cincel-src="${TRACKER}"`);
    // Inline images stay visible.
    expect(blocked).toContain(' src="data:image/png;base64,iVBORw0KGgo="');

    fireEvent.click(screen.getByRole("button", { name: "Mostrar imágenes" }));
    await waitFor(() => expect(bodyFrame().getAttribute("srcdoc")).toContain(` src="${TRACKER}"`));
    expect(bodyFrame().getAttribute("srcdoc")).toContain("img-src data: cid: https: http:");
    expect(screen.queryByRole("button", { name: "Mostrar imágenes" })).toBeNull();
  });

  it("does not offer Mostrar imágenes when there are no remote images", async () => {
    const data = threadData();
    data.messages[0].html = "<p>Solo texto.</p>";
    actions.fetchGmailThreadAction.mockResolvedValue(data);
    await renderReader();
    expect(screen.queryByRole("button", { name: "Mostrar imágenes" })).toBeNull();
  });

  it("lists attachments as download links to the attachments route", async () => {
    await renderReader();
    const list = screen.getByRole("list", { name: "Adjuntos" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/api/gmail/attachments/m-1/a-1");
    expect(links[0].getAttribute("download")).toBe("Cotas cocina rev3.pdf");
    expect(links[0].textContent).toContain("Cotas cocina rev3.pdf");
    expect(links[0].textContent).toContain("1.2 MB");
    expect(links[1].getAttribute("href")).toBe("/api/gmail/attachments/m-1/a%2F2");
    expect(screen.getByText("2 adjuntos")).toBeTruthy();
  });

  it("links the thread to the suggested project after showing the bitácora note", async () => {
    await renderReader();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sugerido: Ensenada" })).toBeTruthy());
    expect(screen.getByText(LINK_NOTE)).toBeTruthy();
    expect(LINK_NOTE).toBe("El asunto del correo quedará en la bitácora del proyecto.");
    expect((screen.getByRole("combobox", { name: "Proyecto" }) as HTMLSelectElement).value).toBe("p-ens");

    // After the link the server's thread carries the project (the refetch after invalidation).
    const linked = threadData();
    actions.fetchGmailThreadAction.mockResolvedValue({ ...linked, thread: { ...linked.thread, projectId: "p-ens" } });
    fireEvent.click(screen.getByRole("button", { name: "Vincular a proyecto" }));
    await waitFor(() => expect(actions.linkGmailThreadToProjectAction).toHaveBeenCalledWith("th-1", "p-ens"));
    await waitFor(() => expect(screen.getByText("Vinculado a Ensenada.")).toBeTruthy());
  });

  it("a link refreshes me.gmail and the project's detail and history", async () => {
    const { client } = await renderReader();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sugerido: Ensenada" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Vincular a proyecto" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["me", "gmail"],
      ["proyectos", "p-ens"],
      ["proyectos", "p-ens", "history"],
    ]);
  });

  it("creates a task in the picked project", async () => {
    await renderReader();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Proyecto" })).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox", { name: "Proyecto" }), { target: { value: "p-plz" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    await waitFor(() =>
      expect(actions.createTaskFromGmailThreadAction).toHaveBeenCalledWith("th-1", { projectId: "p-plz" }),
    );
    expect(actions.linkGmailThreadToProjectAction).not.toHaveBeenCalled();
  });

  it("a task from mail also refreshes tareas, inicio and the sidebar badges", async () => {
    const { client } = await renderReader();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Proyecto" })).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox", { name: "Proyecto" }), { target: { value: "p-plz" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(6));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["me", "gmail"],
      ["proyectos", "p-plz"],
      ["proyectos", "p-plz", "history"],
      ["tareas"],
      ["inicio"],
      ["shell", "badges"],
    ]);
  });

  it("shows the action error inline", async () => {
    actions.linkGmailThreadToProjectAction.mockRejectedValue(new Error("FORBIDDEN"));
    await renderReader();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sugerido: Ensenada" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Vincular a proyecto" }));
    await waitFor(() => expect(screen.getByText("No tienes permiso para realizar esta acción.")).toBeTruthy());
  });

  it("Responder opens the draft sheet prefilled and focus returns to it on close", async () => {
    await renderReader();
    const reply = screen.getByRole("button", { name: "Responder" });
    reply.focus();
    fireEvent.click(reply);
    const sheet = await screen.findByRole("dialog", { name: "Responder" });
    expect((within(sheet).getByLabelText("Para") as HTMLInputElement).value).toBe("juanma@ensenada.mx");
    expect((within(sheet).getByLabelText("Asunto") as HTMLInputElement).value).toBe("Re: Cambios en la planta baja");
    expect(actions.createGmailDraftAction).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Responder" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Responder" })));
  });

  it("the back button closes the reader", async () => {
    const { onClose } = await renderReader();
    fireEvent.click(screen.getByRole("button", { name: "Volver a la bandeja" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides the write actions while their actions are not implemented", async () => {
    flags.IMPLEMENTED.createGmailDraftAction = false;
    flags.IMPLEMENTED.createTaskFromGmailThreadAction = false;
    flags.IMPLEMENTED.linkGmailThreadToProjectAction = false;
    await renderReader();
    expect(screen.queryByRole("button", { name: "Responder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Crear tarea" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Vincular a proyecto" })).toBeNull();
    expect(catalog.fetchCatalogProjectOptions).not.toHaveBeenCalled();
    // Reading still works.
    expect(bodyFrame()).toBeTruthy();
  });

  // One axe pass per theme × mode (× style): slow on a busy machine.
  it("has no serious or critical axe violations in every theme, light and dark", { timeout: 120_000 }, async () => {
    await renderReader();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sugerido: Ensenada" })).toBeTruthy());
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        document.documentElement.setAttribute("data-theme", mode);
        document.documentElement.dataset.appearanceTheme = theme;
        document.documentElement.classList.toggle("dark", mode === "dark");
        // Color contrast needs real layout; the token pairs are covered by lib/ui/contrast.ts.
        // The sandboxed message iframe holds the sender's HTML and the test DOM cannot
        // message into frames, so axe checks the reader around it (the iframe's title is asserted above).
        const results = await axe.run(document.body, {
          iframes: false,
          rules: { "color-contrast": { enabled: false } },
        });
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.map((v) => `${theme}/${mode}: ${v.id}`)).toEqual([]);
      }
    }
    delete document.documentElement.dataset.appearanceTheme;
  });

  it("does not branch on style or import StyleView (FE §18 item 15)", () => {
    for (const file of ["GmailReader.tsx", "gmail-format.ts"]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src).not.toMatch(/StyleView|useStyle|esencial|analitico/);
    }
  });
});
