// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

let pathname = "/inicio";
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
}));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectAction: async () => null }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTaskAction: async (id: string) => (id === "t1" ? { id: "t1", title: "Planos de fachada" } : null),
}));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffDetailAction: async () => null }));
vi.mock("@/lib/actions/assistant-actions", () => ({
  fetchAssistantThreadsAction: async () => [],
  fetchAssistantThreadAction: async () => {
    throw new Error("NOT_FOUND");
  },
}));

import { AssistantLauncher, assistantEntryEnabled } from "../AssistantLauncher";
import { openAssistant, useAssistantUi } from "@/lib/stores/assistant-ui-store";
import { IMPLEMENTED } from "@/lib/actions/assistant-actions.flags";

// The launcher lazy-loads the sheet chunk on first open; load it up front so a
// busy runner's first transform of that tree does not eat the per-test timeout.
beforeAll(async () => {
  await import("../AssistantSheet");
}, 60_000);

beforeEach(() => {
  pathname = "/inicio";
  search = new URLSearchParams();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function pressCmdJ() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));
  });
}

describe("AssistantLauncher", () => {
  it("stays hidden while the assistant-actions IMPLEMENTED flags are false", () => {
    expect(assistantEntryEnabled({ a: true, b: false })).toBe(false);
    expect(assistantEntryEnabled({ a: true, b: true })).toBe(true);
    expect(assistantEntryEnabled()).toBe(Object.values(IMPLEMENTED).every(Boolean));

    render(<AssistantLauncher enabled={false} />);
    expect(screen.queryByRole("button", { name: /Pregúntale a Cincel/ })).toBeNull();
    pressCmdJ();
    expect(screen.queryByText("Cincel", { selector: "h2" })).toBeNull();
  });

  it("is hidden on /asistente", () => {
    pathname = "/asistente";
    render(<AssistantLauncher enabled />);
    expect(screen.queryByRole("button", { name: /Pregúntale a Cincel/ })).toBeNull();
  });

  it("is hidden when the shell asks for it", () => {
    render(<AssistantLauncher enabled hidden />);
    expect(screen.queryByRole("button", { name: /Pregúntale a Cincel/ })).toBeNull();
  });

  it("shows the button with the ⌘J hint and opens the sheet", async () => {
    render(<AssistantLauncher enabled />);
    const button = screen.getByRole("button", { name: /Pregúntale a Cincel/ });
    expect(button.textContent).toContain("⌘J");
    fireEvent.click(button);
    expect(await screen.findByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…")).toBeTruthy();
  });

  it("⌘J toggles the sheet", async () => {
    render(<AssistantLauncher enabled />);
    pressCmdJ();
    expect(await screen.findByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…")).toBeTruthy();
    pressCmdJ();
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…")).toBeNull(),
    );
  });

  it("opens from other entry points through the store's openAssistant()", async () => {
    render(<AssistantLauncher enabled />);
    act(() => openAssistant());
    expect(await screen.findByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…")).toBeTruthy();
    expect(useAssistantUi.getState().open).toBe(true);
  });

  it("marks the store available while active and unavailable when hidden or unmounted", () => {
    const { unmount } = render(<AssistantLauncher enabled />);
    expect(useAssistantUi.getState().available).toBe(true);
    unmount();
    expect(useAssistantUi.getState().available).toBe(false);

    render(<AssistantLauncher enabled hidden />);
    expect(useAssistantUi.getState().available).toBe(false);
  });

  it("⌘J writes the store and mounts the sheet once", async () => {
    render(<AssistantLauncher enabled />);
    pressCmdJ();
    expect(useAssistantUi.getState()).toMatchObject({ open: true, mounted: true });
    await screen.findByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…");
    pressCmdJ();
    expect(useAssistantUi.getState()).toMatchObject({ open: false, mounted: true });
  });

  it("no longer listens for a window event", () => {
    render(<AssistantLauncher enabled />);
    act(() => {
      window.dispatchEvent(new Event("cincel:open-" + "assistant"));
    });
    expect(useAssistantUi.getState().open).toBe(false);
  });

  it("Escape closes the sheet and focus returns to the trigger", async () => {
    render(<AssistantLauncher enabled />);
    const button = screen.getByRole("button", { name: /Pregúntale a Cincel/ });
    button.focus();
    fireEvent.click(button);
    const composer = await screen.findByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…");
    fireEvent.keyDown(composer, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…")).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("passes the route context: /tareas?tarea=<id> shows the confirmed task", async () => {
    pathname = "/tareas";
    search = new URLSearchParams({ tarea: "t1" });
    render(<AssistantLauncher enabled />);
    fireEvent.click(screen.getByRole("button", { name: /Pregúntale a Cincel/ }));
    expect(await screen.findByText("Viendo: Planos de fachada")).toBeTruthy();
  });
});
