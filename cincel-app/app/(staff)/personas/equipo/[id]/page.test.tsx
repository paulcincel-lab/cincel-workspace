import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const loadPersonaDetail = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("./load-persona-detail", () => ({ loadPersonaDetail }));
vi.mock("@/components/personas/PersonaDetail", () => ({ PersonaDetail: () => null }));

import { PersonaDetail } from "@/components/personas/PersonaDetail";
import { personaDetailFixture } from "@/components/personas/persona-detail.fixtures";

import PersonaDetallePage from "./page";

beforeEach(() => {
  notFound.mockClear();
  loadPersonaDetail.mockReset();
});

describe("/personas/equipo/[id]", () => {
  it("renders PersonaDetail with the loaded detail", async () => {
    const detail = personaDetailFixture({ canSeeAdminData: false, canViewHours: false });
    loadPersonaDetail.mockResolvedValue(detail);
    const element = await PersonaDetallePage({ params: Promise.resolve({ id: "s-paul" }) });
    expect(element.type).toBe(PersonaDetail);
    expect(element.props).toEqual({ detail });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("shows the standard not-found state when there is no detail", async () => {
    loadPersonaDetail.mockResolvedValue(null);
    await expect(PersonaDetallePage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
