// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBrowserQueryClient,
  registerUiStoreReset,
  resetClientState,
  resetUiStores,
  setBrowserQueryClient,
} from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";

const unregister: Array<() => void> = [];
afterEach(() => {
  while (unregister.length) unregister.pop()!();
  setBrowserQueryClient(null);
});

describe("resetClientState", () => {
  it("clears the query cache and runs every registered UI store reset", () => {
    const qc = createTestQueryClient();
    qc.setQueryData(["me", "profile"], { name: "Ana" });
    qc.setQueryData(["tareas", "list", {}], [1, 2]);
    const a = vi.fn();
    const b = vi.fn();
    unregister.push(registerUiStoreReset(a), registerUiStoreReset(b));

    resetClientState(qc);

    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("resets the stores even without a client (server, or before the provider mounts)", () => {
    const reset = vi.fn();
    unregister.push(registerUiStoreReset(reset));
    resetClientState(null);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("stops calling a reset once it is unregistered", () => {
    const reset = vi.fn();
    const off = registerUiStoreReset(reset);
    off();
    resetUiStores();
    expect(reset).not.toHaveBeenCalled();
  });

  it("keeps the browser client the provider sets", () => {
    expect(getBrowserQueryClient()).toBeNull();
    const qc = createTestQueryClient();
    setBrowserQueryClient(qc);
    expect(getBrowserQueryClient()).toBe(qc);
  });
});
