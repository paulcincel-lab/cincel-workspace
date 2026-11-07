import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

import TareaLinkPage from "./page";

describe("/tareas/[id] canonical link", () => {
  it("redirects to /tareas?tarea=<id>", async () => {
    await expect(TareaLinkPage({ params: Promise.resolve({ id: "task-123" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/tareas?tarea=task-123",
    );
    expect(navigation.redirect).toHaveBeenLastCalledWith("/tareas?tarea=task-123");
  });

  it("encodes the id in the query string", async () => {
    await expect(TareaLinkPage({ params: Promise.resolve({ id: "a b&c" }) })).rejects.toThrow();
    expect(navigation.redirect).toHaveBeenLastCalledWith("/tareas?tarea=a+b%26c");
  });
});
