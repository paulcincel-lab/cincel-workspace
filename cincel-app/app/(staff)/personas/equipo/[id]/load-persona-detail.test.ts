import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const flags = vi.hoisted(() => ({ IMPLEMENTED: { fetchPersonaDetailAction: true, fetchPeopleOverviewAction: true } }));
const loadPersonasDetail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/people-actions.flags", () => flags);
vi.mock("@/lib/loaders/personas", () => ({ loadPersonasDetail }));

import { personaDetailFixture } from "@/components/personas/persona-detail.fixtures";

import { loadPersonaDetail } from "./load-persona-detail";

const USER = { member: { id: "s-viewer" }, email: "", access: "Colaborador" } as unknown as AuthenticatedUser;

beforeEach(() => {
  loadPersonasDetail.mockReset();
  (flags.IMPLEMENTED as { fetchPersonaDetailAction: boolean }).fetchPersonaDetailAction = true;
});

describe("loadPersonaDetail", () => {
  it("returns the detail from the personas.detail loader for the viewer", async () => {
    const detail = personaDetailFixture({ canSeeAdminData: false, canViewHours: false });
    loadPersonasDetail.mockResolvedValue(detail);
    await expect(loadPersonaDetail(USER, "s-paul")).resolves.toBe(detail);
    expect(loadPersonasDetail).toHaveBeenCalledWith(USER, { staffId: "s-paul" });
  });

  it("passes the loader's null (unknown person) through", async () => {
    loadPersonasDetail.mockResolvedValue(null);
    await expect(loadPersonaDetail(USER, "missing")).resolves.toBeNull();
  });

  it("maps NOT_FOUND to the not-found state", async () => {
    loadPersonasDetail.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(loadPersonaDetail(USER, "missing")).resolves.toBeNull();
  });

  it("maps FORBIDDEN to the not-found state", async () => {
    loadPersonasDetail.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(loadPersonaDetail(USER, "s-paul")).resolves.toBeNull();
  });

  it("lets other errors reach the error boundary", async () => {
    loadPersonasDetail.mockRejectedValue(new Error("boom"));
    await expect(loadPersonaDetail(USER, "s-paul")).rejects.toThrow("boom");
  });

  it("never calls the loader while its IMPLEMENTED flag is false", async () => {
    (flags.IMPLEMENTED as { fetchPersonaDetailAction: boolean }).fetchPersonaDetailAction = false;
    await expect(loadPersonaDetail(USER, "s-paul")).resolves.toBeNull();
    expect(loadPersonasDetail).not.toHaveBeenCalled();
  });
});
