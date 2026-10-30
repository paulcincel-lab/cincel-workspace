import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryEvent } from "@/lib/types/core";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: ACTOR },
    access: "Colaborador",
  })),
}));

const canView = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({ canViewProjects: canView.value }),
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const repo = vi.hoisted(() => ({
  projectExists: vi.fn(),
  listProjectHistory: vi.fn(),
  addProjectComment: vi.fn(),
}));
vi.mock("@/lib/repositories/projects-repository", () => repo);

import {
  addProjectCommentAction,
  fetchProjectHistoryAction,
} from "./projects-actions";

const events: HistoryEvent[] = [
  {
    id: "e2",
    entity: "project",
    entityId: PROJECT,
    kind: "comentario",
    actor: { id: ACTOR, name: "Ana" },
    field: null,
    beforeValue: null,
    afterValue: null,
    comment: "Cliente confirmó medidas",
    eventAt: "2026-10-29T18:00:00.000Z",
  },
  {
    id: "e1",
    entity: "project",
    entityId: PROJECT,
    kind: "cambio",
    actor: null,
    field: "name",
    beforeValue: "Casa A",
    afterValue: "Casa B",
    comment: null,
    eventAt: "2026-10-28T18:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  canView.value = true;
  repo.projectExists.mockResolvedValue(true);
  repo.listProjectHistory.mockResolvedValue(events);
  repo.addProjectComment.mockResolvedValue(events[0]);
});

describe("fetchProjectHistoryAction", () => {
  it("returns the project's comments and changes", async () => {
    await expect(fetchProjectHistoryAction(PROJECT)).resolves.toEqual(events);
    expect(repo.listProjectHistory).toHaveBeenCalledWith(PROJECT);
  });

  it("returns nothing without project view access", async () => {
    canView.value = false;
    await expect(fetchProjectHistoryAction(PROJECT)).resolves.toEqual([]);
    expect(repo.listProjectHistory).not.toHaveBeenCalled();
  });

  it("returns nothing for a missing or deleted project", async () => {
    repo.projectExists.mockResolvedValue(false);
    await expect(fetchProjectHistoryAction(PROJECT)).resolves.toEqual([]);
    expect(repo.listProjectHistory).not.toHaveBeenCalled();
  });
});

describe("addProjectCommentAction", () => {
  it("inserts the trimmed comment as the current staff member", async () => {
    await expect(
      addProjectCommentAction(PROJECT, "  Cliente confirmó medidas "),
    ).resolves.toBeUndefined();
    expect(repo.addProjectComment).toHaveBeenCalledWith(
      PROJECT,
      "Cliente confirmó medidas",
      ACTOR,
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/proyectos/${PROJECT}/ficha`);
  });

  it("throws EMPTY on blank text", async () => {
    await expect(addProjectCommentAction(PROJECT, "   ")).rejects.toThrow(
      "EMPTY",
    );
    expect(repo.addProjectComment).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN without project view access", async () => {
    canView.value = false;
    await expect(addProjectCommentAction(PROJECT, "Hola")).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(repo.addProjectComment).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a missing or deleted project", async () => {
    repo.projectExists.mockResolvedValue(false);
    await expect(addProjectCommentAction(PROJECT, "Hola")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(repo.addProjectComment).not.toHaveBeenCalled();
  });
});
