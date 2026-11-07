// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type * as ReactTypes from "react";
import axe from "axe-core";

import { THEME_IDS } from "@/lib/ui/themes";

const actions = vi.hoisted(() => ({
  fetchGmailThreadAction: vi.fn(),
  linkGmailThreadToProjectAction: vi.fn(),
  createTaskFromGmailThreadAction: vi.fn(),
  createGmailDraftAction: vi.fn(),
  sendGmailDraftAction: vi.fn(),
}));
vi.mock("@/lib/actions/gmail-actions", () => actions);

const projectActions = vi.hoisted(() => ({ fetchProjectsAction: vi.fn() }));
vi.mock("@/lib/actions/projects-actions", () => projectActions);

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
  { id: "p-ens", name: "Ensenada" },
  { id: "p-plz", name: "Platzi" },
];

beforeEach(() => {
  for (const key of Object.keys(flags.IMPLEMENTED)) flags.IMPLEMENTED[key] = true;
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.fetchGmailThreadAction.mockResolvedValue(threadData());
  actions.linkGmailThreadToProjectAction.mockResolvedValue(undefined);
  actions.createTaskFromGmailThreadAction.mockResolvedValue({ taskId: "task-1" });
  projectActions.fetchProjectsAction.mockReset();
  projectActions.fetchProjectsAction.mockResolvedValue(PROJECTS);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

async function renderReader() {
  const onClose = vi.fn();
  render(<GmailReader threadId="th-1" onClose={onClose} />);
  await screen.findByRole("heading", { name: "Cambios en la planta baja" });
  return { onClose };
}

function bodyFrame(): HTMLIFrameElement {
  return screen.getByTitle("Contenido del correo de Juanma Ensenada") as HTMLIFrameElement;
}

describe("GmailReader", () => {
  it("loads the thread and shows its headers", async () => {
    await renderReader();
    expect(actions.fetchGmailThreadAction).toHaveBeenCalledWith("th-1");
    const article = screen.getByRole("article", { name: "Mensaje de Juanma Ensenada" });
    expect(article.textContent).toContain("para Alejandro Riofrio");
    expect(article.querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-06T16:42:00.000Z");
    expect(article.querySelector("time")?.textContent).toBe(article.querySelector("time")?.textContent?.toLowerCase());
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

    fireEvent.click(screen.getByRole("button", { name: "Vincular a proyecto" }));
    await waitFor(() => expect(actions.linkGmailThreadToProjectAction).toHaveBeenCalledWith("th-1", "p-ens"));
    await waitFor(() => expect(screen.getByText("Vinculado a Ensenada.")).toBeTruthy());
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
    expect(projectActions.fetchProjectsAction).not.toHaveBeenCalled();
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
