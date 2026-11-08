// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/page-data/asistente-actions", () => ({
  lookupAssistantContextAction: lookup,
  fetchAssistantThreadAction: vi.fn(),
  getAsistentePageData: vi.fn(),
}));
vi.mock("@/lib/actions/assistant-actions", () => ({ fetchAssistantThreadsAction: vi.fn() }));

import { useConfirmedContext } from "../use-confirmed-context";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { AssistantContext } from "@/lib/types/redesign";

const PROJECT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TASK = "12121212-3434-4565-8787-909090909090";

function setup(context: AssistantContext, enabled = true) {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useConfirmedContext(context, enabled), { wrapper }) };
}

beforeEach(() => {
  lookup.mockReset();
});
afterEach(cleanup);

describe("useConfirmedContext", () => {
  it("returns the lookup's { id, label } under qk.asistente.context(ids)", async () => {
    lookup.mockResolvedValue({ id: TASK, label: "Planos de fachada" });
    const { result, client } = setup({ route: "/tareas", taskId: TASK, projectId: PROJECT });

    await waitFor(() => expect(result.current).toEqual({ id: TASK, label: "Planos de fachada" }));
    expect(Object.keys(result.current!).sort()).toEqual(["id", "label"]);
    expect(lookup).toHaveBeenCalledWith({ projectId: PROJECT, taskId: TASK });
    expect(client.getQueryData(qk.asistente.context({ projectId: PROJECT, taskId: TASK }))).toEqual({
      id: TASK,
      label: "Planos de fachada",
    });
  });

  it("never sends the route, and drops ids that aren't uuids", async () => {
    lookup.mockResolvedValue(null);
    setup({ route: "/proyectos/x", projectId: PROJECT, taskId: "t1" });
    await waitFor(() => expect(lookup).toHaveBeenCalledWith({ projectId: PROJECT }));
  });

  it("is null without an entity id and makes no lookup", async () => {
    const { result } = setup({ route: "/inicio" });
    expect(result.current).toBeNull();
    await Promise.resolve();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not look up while disabled (sheet closed)", async () => {
    const { result } = setup({ route: "/tareas", taskId: TASK }, false);
    await Promise.resolve();
    expect(result.current).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("is null when the lookup fails", async () => {
    lookup.mockRejectedValue(new Error("FORBIDDEN"));
    const { result, client } = setup({ route: "/tareas", taskId: TASK });
    await waitFor(() => expect(client.getQueryState(qk.asistente.context({ taskId: TASK }))?.status).toBe("error"));
    expect(result.current).toBeNull();
  });
});
