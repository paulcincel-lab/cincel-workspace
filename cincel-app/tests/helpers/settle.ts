import type { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Lets the updates a render schedules for later finish inside `act(...)`: the lazy charts replacing their
 * placeholders, Base UI measuring a ScrollArea in a microtask or settling a dialog, popover or menu on the next tick,
 * and TanStack Query delivering a fetched result on a timer. Pass the `QueryClient` to also wait for its fetches to
 * end. Call it after a render or an event that opens an overlay and before running axe or asserting, so the test
 * checks the settled UI and React doesn't warn about an update outside `act`. Uses real timers; with fake timers,
 * advance them inside `act` instead.
 */
export async function settle(client?: QueryClient): Promise<void> {
  await waitFor(() => {
    if (document.querySelector('[data-slot="chart-placeholder"]')) throw new Error("A lazy chart is still loading.");
  });
  await act(async () => {
    for (let i = 0; i < 3; i++) await tick();
    for (let i = 0; client && (client.isFetching() > 0 || client.isMutating() > 0) && i < 200; i++) await tick();
    await tick();
    await tick();
  });
}
