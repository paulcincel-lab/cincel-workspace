import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

const history = vi.hoisted(() => ({
  listHistory: vi.fn(async () => []),
  recordChanges: vi.fn(),
  recordComment: vi.fn(async () => ({})),
}));
vi.mock("@/lib/repositories/history-repository", () => history);

import { addProjectComment, listProjectHistory } from "./projects-repository";

describe("project bitácora repository", () => {
  it("reads history_events for entity 'project'", async () => {
    await listProjectHistory("p1");
    expect(history.listHistory).toHaveBeenCalledWith("project", "p1");
  });

  it("records the comment as a project comentario", async () => {
    await addProjectComment("p1", "Hola", "s1");
    expect(history.recordComment).toHaveBeenCalledWith({
      entity: "project",
      entityId: "p1",
      actorId: "s1",
      comment: "Hola",
    });
  });
});
