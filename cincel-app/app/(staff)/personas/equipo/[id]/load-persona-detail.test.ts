import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ IMPLEMENTED: { fetchPersonaDetailAction: true, fetchPeopleOverviewAction: true } }));
const fetchPersonaDetailAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/people-actions.flags", () => flags);
vi.mock("@/lib/actions/people-actions", () => ({ fetchPersonaDetailAction }));

import { personaDetailFixture } from "@/components/personas/persona-detail.fixtures";

import { loadPersonaDetail } from "./load-persona-detail";

beforeEach(() => {
  fetchPersonaDetailAction.mockReset();
  (flags.IMPLEMENTED as { fetchPersonaDetailAction: boolean }).fetchPersonaDetailAction = true;
});

describe("loadPersonaDetail", () => {
  it("returns the detail from fetchPersonaDetailAction", async () => {
    const detail = personaDetailFixture({ canSeeAdminData: false, canViewHours: false });
    fetchPersonaDetailAction.mockResolvedValue(detail);
    await expect(loadPersonaDetail("s-paul")).resolves.toBe(detail);
    expect(fetchPersonaDetailAction).toHaveBeenCalledWith("s-paul");
  });

  it("maps NOT_FOUND to the not-found state", async () => {
    fetchPersonaDetailAction.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(loadPersonaDetail("missing")).resolves.toBeNull();
  });

  it("maps FORBIDDEN to the not-found state", async () => {
    fetchPersonaDetailAction.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(loadPersonaDetail("s-paul")).resolves.toBeNull();
  });

  it("lets other errors reach the error boundary", async () => {
    fetchPersonaDetailAction.mockRejectedValue(new Error("boom"));
    await expect(loadPersonaDetail("s-paul")).rejects.toThrow("boom");
  });

  it("never calls the action while its IMPLEMENTED flag is false", async () => {
    (flags.IMPLEMENTED as { fetchPersonaDetailAction: boolean }).fetchPersonaDetailAction = false;
    await expect(loadPersonaDetail("s-paul")).resolves.toBeNull();
    expect(fetchPersonaDetailAction).not.toHaveBeenCalled();
  });
});
