import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCapabilityUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser }));

vi.mock("@/lib/db/client", () => ({ db: {} }));

const searchWorkspace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/search/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/search/search")>()),
  searchWorkspace,
}));

import { searchRateLimiter } from "@/lib/search/search";
import { IMPLEMENTED } from "./search-actions.flags";
import { searchWorkspaceAction } from "./search-actions";

const USER = { member: { id: "staff-1" }, email: "a@cincel.mx", access: "Colaborador" };

describe("searchWorkspaceAction", () => {
  beforeEach(() => {
    searchRateLimiter.reset();
    requireCapabilityUser.mockReset();
    requireCapabilityUser.mockResolvedValue(USER);
    searchWorkspace.mockReset();
    searchWorkspace.mockResolvedValue([
      { type: "proyecto", id: "p1", title: "Casa Roble", subtitle: "Diseño · Activo", url: "/proyectos/p1" },
    ]);
  });

  it("is flagged as implemented", () => {
    expect(IMPLEMENTED.searchWorkspaceAction).toBe(true);
  });

  it("rejects unauthenticated callers before searching", async () => {
    requireCapabilityUser.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(searchWorkspaceAction({ query: "casa" })).rejects.toThrow("FORBIDDEN");
    expect(searchWorkspace).not.toHaveBeenCalled();
  });

  it("returns the search results for the session user with the trimmed query", async () => {
    const result = await searchWorkspaceAction({ query: "  casa  " });
    expect(result).toEqual([
      { type: "proyecto", id: "p1", title: "Casa Roble", subtitle: "Diseño · Activo", url: "/proyectos/p1" },
    ]);
    expect(searchWorkspace).toHaveBeenCalledWith(USER, { query: "casa" });
  });

  it.each(["", " ", "a", " a  "])("throws INVALID for the query %j (under 2 trimmed chars)", async (query) => {
    await expect(searchWorkspaceAction({ query })).rejects.toThrow(/^INVALID/);
    expect(searchWorkspace).not.toHaveBeenCalled();
  });

  it("passes a limit between 1 and 50 and rejects one outside", async () => {
    await searchWorkspaceAction({ query: "casa", limit: 1 });
    await searchWorkspaceAction({ query: "casa", limit: 50 });
    expect(searchWorkspace).toHaveBeenNthCalledWith(1, USER, { query: "casa", limit: 1 });
    expect(searchWorkspace).toHaveBeenNthCalledWith(2, USER, { query: "casa", limit: 50 });
    await expect(searchWorkspaceAction({ query: "casa", limit: 0 })).rejects.toThrow(/^INVALID/);
    await expect(searchWorkspaceAction({ query: "casa", limit: 51 })).rejects.toThrow(/^INVALID/);
    await expect(searchWorkspaceAction({ query: "casa", limit: 2.5 })).rejects.toThrow(/^INVALID/);
  });

  it("passes the types filter and rejects unknown types (no accion results)", async () => {
    await searchWorkspaceAction({ query: "casa", types: ["tarea", "nota"] });
    expect(searchWorkspace).toHaveBeenCalledWith(USER, { query: "casa", types: ["tarea", "nota"] });
    await expect(
      searchWorkspaceAction({ query: "casa", types: ["accion" as never] })
    ).rejects.toThrow(/^INVALID/);
  });

  it("throws RATE_LIMITED after 30 calls in a minute, per user", async () => {
    for (let i = 0; i < 30; i++) await searchWorkspaceAction({ query: "casa" });
    await expect(searchWorkspaceAction({ query: "casa" })).rejects.toThrow("RATE_LIMITED");
    expect(searchWorkspace).toHaveBeenCalledTimes(30);

    requireCapabilityUser.mockResolvedValue({ ...USER, member: { id: "staff-2" } });
    await expect(searchWorkspaceAction({ query: "casa" })).resolves.toHaveLength(1);
  });

  it("allows calls again once the minute has passed", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
      for (let i = 0; i < 30; i++) await searchWorkspaceAction({ query: "casa" });
      await expect(searchWorkspaceAction({ query: "casa" })).rejects.toThrow("RATE_LIMITED");
      vi.setSystemTime(new Date("2026-11-07T12:01:01Z"));
      await expect(searchWorkspaceAction({ query: "casa" })).resolves.toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
