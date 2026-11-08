import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { useHasHydrated } from "@/lib/stores/use-has-hydrated";

function makeStore() {
  return create<{ range: string }>()(
    persist(() => ({ range: "7d" }), {
      name: "cincel.ui.test-hydration.v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    }),
  );
}

function Probe({ store }: { store: ReturnType<typeof makeStore> }) {
  const hydrated = useHasHydrated(store);
  const range = store((s) => s.range);
  return <p>{hydrated ? `listo ${range}` : "esperando"}</p>;
}

describe("useHasHydrated", () => {
  it("is false until the persisted store rehydrates, then true with the stored value", async () => {
    localStorage.setItem("cincel.ui.test-hydration.v1", JSON.stringify({ state: { range: "30d" }, version: 0 }));
    const store = makeStore();
    render(<Probe store={store} />);
    expect(screen.getByText("esperando")).toBeTruthy();

    await act(async () => {
      await store.persist.rehydrate();
    });
    expect(screen.getByText("listo 30d")).toBeTruthy();
  });

  it("renders the server snapshot (false) on the server", () => {
    const store = makeStore();
    expect(renderToString(<Probe store={store} />)).toContain("esperando");
  });

  it("starts true for a store that already hydrated", async () => {
    const store = makeStore();
    await store.persist.rehydrate();
    render(<Probe store={store} />);
    expect(screen.getByText("listo 7d")).toBeTruthy();
  });

  it("localStorage is cleared between tests by the zustand reset setup", () => {
    expect(localStorage.getItem("cincel.ui.test-hydration.v1")).toBe(null);
  });
});
