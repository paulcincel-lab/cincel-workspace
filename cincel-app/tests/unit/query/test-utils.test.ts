// @vitest-environment node
/**
 * `asViewer` + `mockSessionModule` (plan §4.8 rule 3): the per-phase DB tests
 * call each page-data action as a given viewer, so the session doubles must
 * serve that viewer and fail like the real module for a guest or a viewer
 * without system access.
 */
import { describe, expect, it } from "vitest";

import { asViewer, getTestViewer, mockSessionModule, type TestViewer } from "@/lib/query/test-utils";

type SessionModule = typeof import("@/lib/auth/session");

const admin: TestViewer = { id: "s-admin", access: "Administrador", name: "Ana", email: "ana@cincel.mx" };
const colaborador: TestViewer = { id: "s-colab", access: "Colaborador" };

const session = mockSessionModule({ untouched: "kept" } as unknown as SessionModule & { untouched: string });

describe("asViewer", () => {
  it("serves the viewer only inside the callback", async () => {
    expect(getTestViewer()).toBeNull();
    const seen = await asViewer(admin, async () => getTestViewer());
    expect(seen).toEqual(admin);
    expect(getTestViewer()).toBeNull();
  });

  it("restores the previous viewer when nested or when the callback throws", async () => {
    await asViewer(admin, async () => {
      await asViewer(colaborador, async () => {
        expect(getTestViewer()?.id).toBe("s-colab");
      });
      expect(getTestViewer()?.id).toBe("s-admin");
      await expect(
        asViewer(null, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(getTestViewer()?.id).toBe("s-admin");
    });
  });
});

describe("mockSessionModule", () => {
  it("keeps the real module's other exports", () => {
    expect((session as unknown as { untouched: string }).untouched).toBe("kept");
  });

  it("serves the active viewer to every session read", async () => {
    await asViewer(admin, async () => {
      const access = await session.getSessionAccess();
      expect(access.status).toBe("active");
      expect(access.user).toMatchObject({ id: "s-admin", name: "Ana", email: "ana@cincel.mx", access: "Administrador" });
      expect((await session.getSession())?.user.id).toBe("s-admin");
      expect((await session.requireSession()).user.id).toBe("s-admin");
      expect((await session.requireSessionAccess()).access).toBe("Administrador");
      const capabilityUser = await session.requireCapabilityUser();
      expect(capabilityUser.access).toBe("Administrador");
      expect(capabilityUser.member.id).toBe("s-admin");
      expect(capabilityUser.email).toBe("ana@cincel.mx");
    });
  });

  it("fails like the real module for a guest", async () => {
    await asViewer(null, async () => {
      expect(await session.getSessionAccess()).toEqual({ status: "guest", user: null });
      expect(await session.getSession()).toBeNull();
      await expect(session.requireSession()).rejects.toThrow("UNAUTHENTICATED");
      await expect(session.requireSessionAccess()).rejects.toThrow("FORBIDDEN");
      await expect(session.requireCapabilityUser()).rejects.toThrow("FORBIDDEN");
    });
  });

  it("forbids a viewer without system access", async () => {
    await asViewer({ ...colaborador, status: "no_system_access" }, async () => {
      await expect(session.requireSessionAccess()).rejects.toThrow("FORBIDDEN");
      await expect(session.requireCapabilityUser()).rejects.toThrow("FORBIDDEN");
    });
  });
});
