import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const redirectIfRedesignOff = vi.hoisted(() => vi.fn(async () => undefined));
const loadPersonaDetail = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/ui/redesign-redirect", () => ({ redirectIfRedesignOff }));
vi.mock("./load-persona-detail", () => ({ loadPersonaDetail }));
vi.mock("@/components/personas/PersonaDetail", () => ({ PersonaDetail: () => null }));

import { PersonaDetail } from "@/components/personas/PersonaDetail";
import { personaDetailFixture } from "@/components/personas/persona-detail.fixtures";

import PersonaDetallePage from "./page";

beforeEach(() => {
  notFound.mockClear();
  redirectIfRedesignOff.mockClear();
  loadPersonaDetail.mockReset();
});

describe("/personas/equipo/[id]", () => {
  it("checks the redesign flag with the page path before loading", async () => {
    loadPersonaDetail.mockResolvedValue(personaDetailFixture({ canSeeAdminData: false, canViewHours: false }));
    await PersonaDetallePage({ params: Promise.resolve({ id: "s-paul" }) });
    expect(redirectIfRedesignOff).toHaveBeenCalledWith("/personas/equipo/s-paul");
    expect(redirectIfRedesignOff.mock.invocationCallOrder[0]).toBeLessThan(
      loadPersonaDetail.mock.invocationCallOrder[0],
    );
  });

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
