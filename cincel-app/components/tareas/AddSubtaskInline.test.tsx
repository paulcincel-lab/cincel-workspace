// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { seedSessionUser } from "../../tests/helpers/session-user";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { qk } from "@/lib/query/keys";

const actions = vi.hoisted(() => ({ createSubtaskAction: vi.fn() }));
vi.mock("@/lib/actions/tasks-actions", () => actions);

const caps = vi.hoisted(() => ({ canCreateActivity: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: caps.canCreateActivity }),
}));

import { AddSubtaskInline, useCanCreateSubtask } from "./AddSubtaskInline";

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const PROJECT = "00000000-0000-4000-8000-000000000001";

function renderField(variant: "field" | "link" = "field", onCreated = vi.fn()) {
  const client = createTestQueryClient();
  const spy = vi.spyOn(client, "invalidateQueries");
  const view = renderWithQueryClient(<AddSubtaskInline parentId={PARENT} projectId={PROJECT} variant={variant} onCreated={onCreated} />, { client });
  return { ...view, spy, onCreated };
}

describe("AddSubtaskInline (#1107)", () => {
  beforeEach(() => {
    actions.createSubtaskAction.mockResolvedValue({ ok: true, data: { id: "c1", title: "Medir muros" } });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("Enter creates the subtask of the parent and refreshes only that task's keys and the Tareas views", async () => {
    const { spy, onCreated } = renderField();
    const input = screen.getByLabelText("Título de la nueva subtarea") as HTMLInputElement;
    expect(input.placeholder).toBe("Agregar subtarea…");
    fireEvent.change(input, { target: { value: "  Medir muros " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(actions.createSubtaskAction).toHaveBeenCalledWith(PARENT, { title: "Medir muros" });
    expect(input.value).toBe("");
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: readonly unknown[] }).queryKey);
    expect(keys).toContainEqual(qk.tasks.detail(PARENT));
    expect(keys).toContainEqual(qk.tasks.children(PARENT));
  });

  it("an empty title creates nothing", () => {
    renderField();
    fireEvent.keyDown(screen.getByLabelText("Título de la nueva subtarea"), { key: "Enter" });
    expect(actions.createSubtaskAction).not.toHaveBeenCalled();
  });

  it("Escape clears the field without creating", () => {
    renderField();
    const input = screen.getByLabelText("Título de la nueva subtarea") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Algo" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(actions.createSubtaskAction).not.toHaveBeenCalled();
  });

  it("the link variant opens the field and Escape closes it and returns focus to the link", async () => {
    renderField("link");
    const link = screen.getByRole("button", { name: "+ Agregar subtarea" });
    fireEvent.click(link);
    const input = screen.getByLabelText("Título de la nueva subtarea");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("Título de la nueva subtarea")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Agregar subtarea" })));
  });

  it("shows NESTED and FORBIDDEN inline and keeps the text", async () => {
    actions.createSubtaskAction.mockResolvedValueOnce({ ok: false, error: "NESTED" });
    renderField();
    const input = screen.getByLabelText("Título de la nueva subtarea") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Otra" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toBe("Una subtarea no puede tener subtareas.");
    expect(input.value).toBe("Otra");
  });
});

describe("useCanCreateSubtask", () => {
  afterEach(() => cleanup());

  function Probe() {
    return <span>{useCanCreateSubtask() ? "sí" : "no"}</span>;
  }

  it("follows activities.canCreateActivity", () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Colaborador" });
    caps.canCreateActivity = true;
    const { unmount } = renderWithQueryClient(<Probe />);
    expect(screen.getByText("sí")).toBeTruthy();
    unmount();
    caps.canCreateActivity = false;
    renderWithQueryClient(<Probe />);
    expect(screen.getByText("no")).toBeTruthy();
  });

  it("is false without a session", () => {
    seedSessionUser(null);
    caps.canCreateActivity = true;
    renderWithQueryClient(<Probe />);
    expect(screen.getByText("no")).toBeTruthy();
  });
});
