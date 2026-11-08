/**
 * The prefetch + HydrationBoundary pattern (plan §4.1): data the server
 * prefetched (through the loader, never the action) renders on the client
 * with zero client action calls, and a streamed (pending) query is
 * dehydrated too.
 */
import { screen } from "@testing-library/react";
import { QueryClient, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";

import { dehydrateQueries, Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { hydrationRoundtrip, mockAction, renderWithQueryClient } from "@/lib/query/test-utils";

type Inicio = { greeting: string; openTasks: number };

/** The client action the queryFn would call; it must never run when the data is hydrated. */
const fetchInicioAction = mockAction(async (): Promise<Inicio> => ({ greeting: "cliente", openTasks: -1 }));

/** The server loader the page calls directly. */
const loadInicio = mockAction(async (): Promise<Inicio> => ({ greeting: "Hola, Ana", openTasks: 3 }));

function InicioView() {
  const { data } = useSuspenseQuery({ queryKey: qk.inicio(), queryFn: () => fetchInicioAction(undefined) });
  return (
    <p>
      {data.greeting} · {data.openTasks} tareas
    </p>
  );
}

describe("prefetch + HydrationBoundary", () => {
  it("renders the server-fetched data with 0 client action calls", async () => {
    const { client, state } = await hydrationRoundtrip((serverClient) =>
      prefetch(serverClient, { queryKey: qk.inicio() }, () => loadInicio(undefined)),
    );

    renderWithQueryClient(
      <Suspense fallback={<p>Cargando</p>}>
        <InicioView />
      </Suspense>,
      { client, hydrate: state },
    );

    expect(await screen.findByText("Hola, Ana · 3 tareas")).toBeTruthy();
    expect(loadInicio.calls).toHaveLength(1);
    expect(fetchInicioAction.calls).toHaveLength(0);
  });

  it("dehydrates pending queries so a streamed prefetch is not fetched again", () => {
    const serverClient = new QueryClient();
    let resolve!: (value: Inicio) => void;
    void prefetch(serverClient, { queryKey: qk.inicio() }, () => new Promise<Inicio>((r) => (resolve = r)));
    const state = dehydrateQueries(serverClient);
    expect(state.queries.map((q) => [q.queryKey, q.state.status])).toEqual([[qk.inicio(), "pending"]]);
    resolve({ greeting: "x", openTasks: 0 });
  });

  it("does not dehydrate failed queries", async () => {
    const serverClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await prefetch(serverClient, { queryKey: qk.inicio() }, async () => {
      throw new Error("FORBIDDEN");
    });
    expect(dehydrateQueries(serverClient).queries).toEqual([]);
  });

  it("<Hydrate> hands the server client's cache to the browser client", async () => {
    const serverClient = new QueryClient();
    await prefetch(serverClient, { queryKey: qk.me.profile(), staleTime: 60_000 }, async () => ({ name: "Ana" }));
    const fetchProfileAction = mockAction(async () => ({ name: "cliente" }));
    function Profile() {
      const { data } = useQuery({ queryKey: qk.me.profile(), queryFn: () => fetchProfileAction(undefined) });
      return <span>{data?.name ?? "vacío"}</span>;
    }

    renderWithQueryClient(
      <Hydrate qc={serverClient}>
        <Profile />
      </Hydrate>,
    );

    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(fetchProfileAction.calls).toHaveLength(0);
  });

  it("getQueryClient returns a fresh client outside a request", () => {
    expect(getQueryClient()).toBeInstanceOf(QueryClient);
  });
});
