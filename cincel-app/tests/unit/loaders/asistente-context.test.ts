// @vitest-environment node
/**
 * Security (Query Migration Phase 10, #944, plan §4.8 rule 6): the
 * confirmed-context lookup returns only `{ id, label }`, never the rest of
 * the task, project or person (no email, phone or profile).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getTaskForViewer: vi.fn(),
  getProject: vi.fn(),
  staffRows: [] as unknown[],
  canViewTeam: true,
  canViewProjects: true,
  canViewActivities: true,
}));

vi.mock("@/lib/repositories/tasks-repository", () => ({ getTaskForViewer: h.getTaskForViewer }));
vi.mock("@/lib/repositories/projects-repository", () => ({ getProject: h.getProject }));
vi.mock("@/lib/repositories/assistant-repository", () => ({}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: h.canViewActivities }),
  resolveProjectsCapabilities: () => ({ canViewProjects: h.canViewProjects }),
  resolveTeamCapabilities: () => ({ canViewTeam: h.canViewTeam }),
}));
vi.mock("@/lib/auth/viewer-scope", () => ({ viewerScopeOf: () => ({ staffId: "s1", isAdmin: false }) }));
vi.mock("@/lib/db/client", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => h.staffRows,
  };
  return { db: chain, schema: { staff: { id: "id", name: "name", lastName: "lastName", deletedAt: "deletedAt" } } };
});

import { loadAssistantContextLabel } from "@/lib/loaders/asistente";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const user = { member: { id: "s1" }, access: "Colaborador" } as AuthenticatedUser;
const TASK = "12121212-3434-4565-8787-909090909090";
const PROJECT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PERSON = "99999999-8888-4777-8666-555555555555";

beforeEach(() => {
  h.getTaskForViewer.mockReset().mockResolvedValue(null);
  h.getProject.mockReset().mockResolvedValue(null);
  h.staffRows = [];
  h.canViewTeam = true;
  h.canViewProjects = true;
  h.canViewActivities = true;
});

describe("loadAssistantContextLabel", () => {
  it("a task: only { id, label }", async () => {
    h.getTaskForViewer.mockResolvedValue({
      id: TASK,
      title: "Planos de fachada",
      description: "Interno",
      assignee: { id: "s2", name: "Ana", email: "ana@cincel.mx" },
      project: { id: PROJECT, name: "Casa Roble" },
    });
    const result = await loadAssistantContextLabel(user, { taskId: TASK, projectId: PROJECT });
    expect(result).toEqual({ id: TASK, label: "Planos de fachada" });
    expect(Object.keys(result!).sort()).toEqual(["id", "label"]);
  });

  it("a person: only { id, label }, from the name columns", async () => {
    h.staffRows = [{ id: PERSON, name: "Ana", lastName: "López" }];
    const result = await loadAssistantContextLabel(user, { personId: PERSON });
    expect(result).toEqual({ id: PERSON, label: "Ana López" });
    expect(Object.keys(result!).sort()).toEqual(["id", "label"]);
    expect(JSON.stringify(result)).not.toMatch(/email|phone|profile/);
  });

  it("a project: only { id, label }", async () => {
    h.getProject.mockResolvedValue({ id: PROJECT, name: "Casa Roble", client: { email: "cliente@x.mx" }, budget: 1 });
    const result = await loadAssistantContextLabel(user, { projectId: PROJECT });
    expect(result).toEqual({ id: PROJECT, label: "Casa Roble" });
    expect(Object.keys(result!).sort()).toEqual(["id", "label"]);
  });

  it("the most specific visible id wins: task, then person, then project", async () => {
    h.staffRows = [{ id: PERSON, name: "Ana", lastName: null }];
    h.getProject.mockResolvedValue({ id: PROJECT, name: "Casa Roble" });
    expect(await loadAssistantContextLabel(user, { taskId: TASK, personId: PERSON, projectId: PROJECT })).toEqual({
      id: PERSON,
      label: "Ana",
    });
  });

  it("null without the capability, for an invisible id, or when a read fails", async () => {
    h.canViewTeam = false;
    h.staffRows = [{ id: PERSON, name: "Ana", lastName: null }];
    expect(await loadAssistantContextLabel(user, { personId: PERSON })).toBeNull();

    h.getProject.mockRejectedValue(new Error("boom"));
    expect(await loadAssistantContextLabel(user, { projectId: PROJECT })).toBeNull();

    expect(await loadAssistantContextLabel(user, {})).toBeNull();
  });
});
