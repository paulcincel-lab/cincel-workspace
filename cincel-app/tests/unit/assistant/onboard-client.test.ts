// @vitest-environment node
/**
 * `onboard_client` after #1037 / #1055: the project is created without a
 * tramo, the client is linked to it (project client for administrators,
 * project contact otherwise), an existing client is reused, and the chosen
 * tramo starts with its managers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchContactsAction: vi.fn(),
  createContactAction: vi.fn(),
  createProjectAction: vi.fn(),
  updateProjectAction: vi.fn(),
  setProjectContactsAction: vi.fn(),
  startTramoAction: vi.fn(),
  fetchWorkflowsAction: vi.fn(),
  listViewerTasks: vi.fn(),
  requireCapabilityUser: vi.fn(),
}));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactsAction: h.fetchContactsAction,
  createContactAction: h.createContactAction,
  mergeContactsAction: vi.fn(),
}));
vi.mock("@/lib/actions/projects-actions", () => ({
  createProjectAction: h.createProjectAction,
  deleteProjectAction: vi.fn(),
  updateProjectAction: h.updateProjectAction,
  setProjectContactsAction: h.setProjectContactsAction,
}));
vi.mock("@/lib/actions/tramo-start-actions", () => ({ startTramoAction: h.startTramoAction }));
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: vi.fn(), assignTaskAction: vi.fn(), mergeTasksAction: vi.fn() }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: h.fetchWorkflowsAction }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffAction: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/assistant/reads", () => ({ listViewerProjects: vi.fn(), listViewerTasks: h.listViewerTasks }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: h.requireCapabilityUser }));

import { onboard_client } from "@/lib/assistant/tools";

function userWith(access: string) {
  return { member: { id: "s1", name: "Ana", role: access, active: true }, email: "a@cincel.mx", access };
}

async function run(input: Record<string, unknown>) {
  const execute = onboard_client.execute as unknown as (input: unknown, options: unknown) => Promise<Record<string, unknown>>;
  return execute(
    { kind: "Particular", workflow: "presale", ...input },
    { toolCallId: "c1", messages: [] },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.fetchWorkflowsAction.mockResolvedValue([
    { id: "w1", key: "presale", name: "Presale", phases: [{ id: "f1", active: true }, { id: "f2", active: false }] },
  ]);
  h.fetchContactsAction.mockResolvedValue([]);
  h.createContactAction.mockResolvedValue({ ok: true, data: { id: "c-new", name: "Acme", kind: "particular" } });
  h.createProjectAction.mockResolvedValue({ ok: true, data: { id: "p1", name: "Casa Acme" } });
  h.updateProjectAction.mockResolvedValue({ ok: true, data: { id: "p1" } });
  h.setProjectContactsAction.mockResolvedValue({ ok: true, data: undefined });
  h.startTramoAction.mockResolvedValue({ ok: true, data: {} });
  h.listViewerTasks.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
});

describe("onboard_client", () => {
  it("an administrator: new client, project without a etapa, client set on the project, etapa started", async () => {
    h.requireCapabilityUser.mockResolvedValue(userWith("Administrador"));
    const out = await run({ name: "Acme", projectName: "Casa Acme" });

    expect(h.createProjectAction).toHaveBeenCalledWith({ name: "Casa Acme", startWorkflowId: null });
    expect(h.updateProjectAction).toHaveBeenCalledWith("p1", { clientId: "c-new" });
    expect(h.setProjectContactsAction).not.toHaveBeenCalled();
    expect(h.startTramoAction).toHaveBeenCalledWith({
      projectId: "p1",
      workflowId: "w1",
      phaseIds: ["f1"],
      assignment: { mode: "none" },
    });
    expect(out).toMatchObject({ ok: true, clientLink: "cliente", tasksCreated: 2, client: { id: "c-new" } });
    expect(out.note).toBeUndefined();
  });

  it("another role links the client as a project contact and says so", async () => {
    h.requireCapabilityUser.mockResolvedValue(userWith("Arquitecto Senior"));
    const out = await run({ name: "Acme", projectName: "Casa Acme" });

    expect(h.updateProjectAction).not.toHaveBeenCalled();
    expect(h.setProjectContactsAction).toHaveBeenCalledWith("p1", [{ contactId: "c-new", role: "Cliente" }]);
    expect(out).toMatchObject({ ok: true, clientLink: "contacto" });
    expect(String(out.note)).toContain("administrador");
  });

  it("reuses a client with the same name", async () => {
    h.requireCapabilityUser.mockResolvedValue(userWith("Administrador"));
    h.fetchContactsAction.mockResolvedValue([{ id: "c-old", name: " acme ", kind: "empresa" }]);
    const out = await run({ name: "Acme", projectName: "Casa Acme" });

    expect(h.fetchContactsAction).toHaveBeenCalledWith({ type: "cliente" });
    expect(h.createContactAction).not.toHaveBeenCalled();
    expect(h.updateProjectAction).toHaveBeenCalledWith("p1", { clientId: "c-old" });
    expect(out).toMatchObject({ client: { id: "c-old" } });
  });
});
