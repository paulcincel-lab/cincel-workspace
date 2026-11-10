// @vitest-environment node
/**
 * `recordResourceOpenAction` (Biblioteca Analítico "Aperturas 30 d", #1006):
 * one row per person and link every 10 minutes, and only for a link the
 * viewer can see. The database is a small in-memory fake of the drizzle
 * calls the repository makes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeLink } from "@/components/biblioteca/biblioteca.fixtures";
import type { ResourceLink } from "@/lib/types/resource";

const state = vi.hoisted(() => ({
  viewerId: "staff-ana",
  canViewEmpresa: true,
  canViewResources: true,
  link: null as unknown,
  opens: [] as { linkId: string; staffId: string; openedAt: Date }[],
  inserted: 0,
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: state.viewerId, name: "Ana Ríos", role: "Colaborador", area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
    email: "ana@cincel.example",
    access: "Colaborador",
  })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveResourcesCapabilities: () => ({
    canViewResources: state.canViewResources,
    canManageFavoritesSection: true,
    enterprise: { canView: state.canViewEmpresa, canCreate: false, canEdit: false, canDelete: false, canCreateCategory: false },
    corporate: { canCreate: true, canDelete: false, editScope: "owned_or_personal" },
  }),
}));

vi.mock("@/lib/repositories/resources-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/repositories/resources-repository")>();
  return {
    ...original,
    getResourceLink: vi.fn(async (id: string) => ((state.link as ResourceLink | null)?.id === id ? state.link : null)),
  };
});

// The repository's open queries: select (dedupe look-up), insert, delete (retention).
vi.mock("@/lib/db/client", () => {
  const select = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        const link = state.link as ResourceLink;
        const since = Date.now() - 10 * 60 * 1000;
        const hit = state.opens.find((o) => o.linkId === link.id && o.staffId === state.viewerId && o.openedAt.getTime() > since);
        return hit ? [{ id: "open-1" }] : [];
      },
    };
    return chain;
  };
  return {
    db: {
      select,
      insert: () => ({
        values: async (row: { resourceLinkId: string; staffId: string; openedAt: Date }) => {
          state.inserted += 1;
          state.opens.push({ linkId: row.resourceLinkId, staffId: row.staffId, openedAt: row.openedAt });
        },
      }),
      delete: () => ({ where: async () => undefined }),
    },
  };
});

const { recordResourceOpenAction } = await import("@/lib/actions/resources-actions");

describe("recordResourceOpenAction", () => {
  beforeEach(() => {
    state.viewerId = "staff-ana";
    state.canViewEmpresa = true;
    state.canViewResources = true;
    state.opens = [];
    state.inserted = 0;
    state.link = makeLink({ id: "bitacora", section: "formatos-obra" });
    vi.useRealTimers();
  });

  it("recordResourceOpenAction dedupes within 10 minutes", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-09T18:00:00.000Z"), toFake: ["Date"] });
    expect(await recordResourceOpenAction({ linkId: "bitacora" })).toEqual({ ok: true, data: { recorded: true } });
    vi.setSystemTime(new Date("2026-11-09T18:09:00.000Z"));
    expect(await recordResourceOpenAction({ linkId: "bitacora" })).toEqual({ ok: true, data: { recorded: false } });
    expect(state.inserted).toBe(1);
    vi.setSystemTime(new Date("2026-11-09T18:11:00.000Z"));
    expect(await recordResourceOpenAction({ linkId: "bitacora" })).toEqual({ ok: true, data: { recorded: true } });
    expect(state.inserted).toBe(2);
  });

  it("recordResourceOpenAction rejects a link the viewer cannot see", async () => {
    state.link = makeLink({ id: "ajeno", section: "mis-documentos", personalFor: { id: "staff-luis", name: "Luis" } });
    expect(await recordResourceOpenAction({ linkId: "ajeno" })).toMatchObject({ ok: false, error: expect.stringMatching(/^FORBIDDEN/) });

    state.link = makeLink({ id: "manual", section: "empresa" });
    state.canViewEmpresa = false;
    expect(await recordResourceOpenAction({ linkId: "manual" })).toMatchObject({ ok: false, error: expect.stringMatching(/^FORBIDDEN/) });

    expect(await recordResourceOpenAction({ linkId: "no-existe" })).toMatchObject({ ok: false, error: expect.stringMatching(/^NOT_FOUND/) });
    expect(state.inserted).toBe(0);
  });
});
