// @vitest-environment happy-dom
/**
 * SessionHydrator is the one writer of the server session into the store:
 * it seeds before the first passive effect, keeps the stored object on an
 * unchanged revalidation, and an identity change (A → B) empties the query
 * cache and the UI stores.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { create } from "zustand";

import type { SessionAccess } from "@/lib/auth/session";
import { registerUiStoreReset, setBrowserQueryClient } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { resetSessionStoreForTests, selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { sessionAccessFor } from "@/tests/helpers/session-user";
import SessionHydrator from "./SessionHydrator";

const A = sessionAccessFor({ member: { id: "a", name: "Ana" }, email: "ana@example.test", access: "Colaborador" });
const B = sessionAccessFor({ member: { id: "b", name: "Beto" }, email: "beto@example.test", access: "Colaborador" });

const INITIAL = { draft: "" };
const useDemoUi = create<typeof INITIAL>(() => ({ ...INITIAL }));
registerUiStoreReset(() => useDemoUi.setState({ ...INITIAL }));

let qc = createTestQueryClient();

beforeEach(() => {
  resetSessionStoreForTests();
  qc = createTestQueryClient();
  setBrowserQueryClient(qc);
});

afterEach(() => {
  cleanup();
  setBrowserQueryClient(null);
  resetSessionStoreForTests();
});

/** Records what the store held when a sibling's passive effect first ran. */
function EffectProbe({ seen }: { seen: SessionAccess[] }) {
  useEffect(() => {
    seen.push(useSessionStore.getState().access);
  }, [seen]);
  return null;
}

describe("SessionHydrator", () => {
  it("seeds the store before the passive effects of the same commit", () => {
    const seen: SessionAccess[] = [];
    render(
      <>
        <SessionHydrator value={A} />
        <EffectProbe seen={seen} />
      </>,
    );
    expect(seen).toEqual([A]);
    expect(selectCurrentUser(useSessionStore.getState())?.member.id).toBe("a");
  });

  it("keeps the stored object when a revalidation resolves the same session", () => {
    const view = render(<SessionHydrator value={A} />);
    const stored = useSessionStore.getState().access;
    view.rerender(<SessionHydrator value={{ ...A, user: A.user ? { ...A.user } : null }} />);
    expect(useSessionStore.getState().access).toBe(stored);
  });

  it("the first seed keeps the hydrated cache; A → guest → B empties the cache and the UI stores", () => {
    qc.setQueryData(["me", "profile"], { name: "Ana" });
    const view = render(<SessionHydrator value={A} />);
    expect(qc.getQueryData(["me", "profile"])).toEqual({ name: "Ana" });

    useDemoUi.setState({ draft: "Ana draft" });
    view.rerender(<SessionHydrator value={{ status: "guest", user: null }} />);
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(useDemoUi.getState()).toEqual(INITIAL);

    qc.setQueryData(["tareas", "list", {}], ["guest leftovers"]);
    useDemoUi.setState({ draft: "leftover" });
    view.rerender(<SessionHydrator value={B} />);
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(useDemoUi.getState()).toEqual(INITIAL);
    expect(selectCurrentUser(useSessionStore.getState())?.member.id).toBe("b");
  });
});
