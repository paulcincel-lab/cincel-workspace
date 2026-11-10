// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
  delete: vi.fn(),
  readOnly: false,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name) } : undefined),
    set: (...args: unknown[]) => {
      if (jar.readOnly) throw new Error("Cookies can only be modified in a Server Action or Route Handler");
      jar.set(...args);
    },
    delete: (...args: unknown[]) => jar.delete(...args),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const store = vi.hoisted(() => ({
  findActivePortalSession: vi.fn(),
  slidePortalSession: vi.fn(),
  insertPortalSession: vi.fn(),
  deletePortalSessionByTokenHash: vi.fn(),
  findPortalProjectAccess: vi.fn(),
}));
vi.mock("@/lib/portal/session-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal/session-store")>()),
  ...store,
}));

import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { PortalNotFoundError } from "@/lib/portal/drive-guard";
import { hashPortalToken } from "@/lib/portal/session-store";

import {
  createPortalSession,
  destroyPortalSession,
  getPortalUser,
  getPortalViewer,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_REFRESH_MS,
  PORTAL_SESSION_TTL_MS,
  portalErrorResponse,
  portalSignOutPath,
  PortalUnauthorizedError,
  requirePortalApiUser,
  requirePortalUser,
  requirePortalViewer,
  requireProjectAccess,
} from "./session";

const HOUR = 3_600_000;
const PROJECT_ID = "6f1c2a52-6d3e-4f4b-9c3a-2b1e0d9f8a77";
const user = { id: "pu-1", name: "Ana López", email: "ana@example.com", contactId: "c-1", companyName: null };

function record(refreshedAgoMs: number) {
  const now = Date.now();
  return {
    sessionId: "ps-1",
    expiresAt: new Date(now + PORTAL_SESSION_TTL_MS - refreshedAgoMs),
    refreshedAt: new Date(now - refreshedAgoMs),
    user,
  };
}

const access = {
  accessId: "acc-1",
  projectId: PROJECT_ID,
  name: "Casa Lomas",
  code: "P-01",
  status: "activo",
  managerId: null,
  coordinatorId: null,
  driveFolderStatus: "ready" as const,
  driveClientFolderId: "f-cliente",
  driveInboundFolderId: "f-inbound",
};

beforeEach(() => {
  jar.values.clear();
  jar.set.mockReset();
  jar.delete.mockReset();
  jar.readOnly = false;
  for (const fn of Object.values(store)) fn.mockReset();
});

describe("portalSignOutPath", () => {
  it("defaults to the portal login and encodes next", () => {
    expect(portalSignOutPath()).toBe("/api/portal/auth/logout?next=%2Fportal%2Flogin");
    expect(portalSignOutPath("/portal/proyectos/1?tab=cronograma")).toBe(
      "/api/portal/auth/logout?next=%2Fportal%2Fproyectos%2F1%3Ftab%3Dcronograma"
    );
  });

  it("falls back to the portal login for unsafe targets", () => {
    expect(portalSignOutPath("https://evil.example/")).toBe("/api/portal/auth/logout?next=%2Fportal%2Flogin");
    expect(portalSignOutPath("//evil.example")).toBe("/api/portal/auth/logout?next=%2Fportal%2Flogin");
  });
});

describe("getPortalUser", () => {
  it("is null without a portal cookie and never queries", async () => {
    expect(await getPortalUser()).toBeNull();
    expect(store.findActivePortalSession).not.toHaveBeenCalled();
  });

  it("looks the session up by the sha256 of the cookie token", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    store.findActivePortalSession.mockResolvedValue(record(HOUR));
    expect(await getPortalUser()).toEqual(user);
    expect(store.findActivePortalSession).toHaveBeenCalledWith(hashPortalToken("tok-1"), expect.any(Date));
    expect(hashPortalToken("tok-1")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is null for an unknown, expired or inactive-user session", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "stale");
    store.findActivePortalSession.mockResolvedValue(null);
    expect(await getPortalUser()).toBeNull();
  });
});

describe("sliding expiry", () => {
  it("does not write when refreshed within the last 24 h", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    store.findActivePortalSession.mockResolvedValue(record(PORTAL_SESSION_REFRESH_MS - HOUR));
    await getPortalUser();
    expect(store.slidePortalSession).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("extends expires_at to now + 30 days and refreshes the cookie after 24 h", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    store.findActivePortalSession.mockResolvedValue(record(PORTAL_SESSION_REFRESH_MS + HOUR));
    const before = Date.now();
    await getPortalUser();

    expect(store.slidePortalSession).toHaveBeenCalledOnce();
    const [sessionId, now, expiresAt] = store.slidePortalSession.mock.calls[0] as [string, Date, Date];
    expect(sessionId).toBe("ps-1");
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(expiresAt.getTime() - now.getTime()).toBe(PORTAL_SESSION_TTL_MS);
    expect(jar.set).toHaveBeenCalledWith(
      PORTAL_SESSION_COOKIE,
      "tok-1",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt })
    );
  });

  it("still slides in a Server Component, where cookies are read-only", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    jar.readOnly = true;
    store.findActivePortalSession.mockResolvedValue(record(PORTAL_SESSION_REFRESH_MS + HOUR));
    expect(await getPortalUser()).toEqual(user);
    expect(store.slidePortalSession).toHaveBeenCalledOnce();
  });
});

describe("getPortalViewer / requirePortalViewer (page-data actions)", () => {
  it("reads the session without sliding it, even after 24 h", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    store.findActivePortalSession.mockResolvedValue(record(PORTAL_SESSION_REFRESH_MS + HOUR));

    expect(await getPortalViewer()).toEqual(user);
    expect(await requirePortalViewer()).toEqual(user);
    expect(store.findActivePortalSession).toHaveBeenCalledWith(hashPortalToken("tok-1"), expect.any(Date));
    expect(store.slidePortalSession).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("is null without a cookie, and requirePortalViewer redirects through the sign-out", async () => {
    expect(await getPortalViewer()).toBeNull();
    expect(store.findActivePortalSession).not.toHaveBeenCalled();
    await expect(requirePortalViewer()).rejects.toThrow("NEXT_REDIRECT /api/portal/auth/logout?next=%2Fportal%2Flogin");
  });
});

describe("requirePortalUser (pages)", () => {
  it("redirects through the logout route when there is no cookie", async () => {
    await expect(requirePortalUser()).rejects.toThrow(
      "NEXT_REDIRECT /api/portal/auth/logout?next=%2Fportal%2Flogin"
    );
  });

  it("redirects through the logout route for an expired or invalid session", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "expired");
    store.findActivePortalSession.mockResolvedValue(null);
    await expect(requirePortalUser()).rejects.toThrow("NEXT_REDIRECT /api/portal/auth/logout?next=%2Fportal%2Flogin");
  });

  it("returns the user for a live session", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    store.findActivePortalSession.mockResolvedValue(record(HOUR));
    await expect(requirePortalUser()).resolves.toEqual(user);
  });
});

describe("requirePortalApiUser + portalErrorResponse (API)", () => {
  it("throws PortalUnauthorizedError for an expired or invalid session", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "expired");
    store.findActivePortalSession.mockResolvedValue(null);
    await expect(requirePortalApiUser()).rejects.toBeInstanceOf(PortalUnauthorizedError);
  });

  it("maps it to 401 { redirect } and clears the portal cookie", async () => {
    const response = portalErrorResponse(new PortalUnauthorizedError());
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ redirect: "/portal/login" });
    const cleared = response?.cookies.get(PORTAL_SESSION_COOKIE);
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });

  it("maps a not-found to 404 and leaves other errors to the route", async () => {
    expect(portalErrorResponse(new PortalNotFoundError())?.status).toBe(404);
    expect(portalErrorResponse(new Error("boom"))).toBeNull();
  });
});

describe("requireProjectAccess", () => {
  it("returns the project for an active access row", async () => {
    store.findPortalProjectAccess.mockResolvedValue(access);
    await expect(requireProjectAccess(PROJECT_ID, user)).resolves.toEqual(access);
    expect(store.findPortalProjectAccess).toHaveBeenCalledWith("pu-1", PROJECT_ID);
  });

  it("throws a 404 (never 403) in API routes when there is no access, or the project is cancelado or deleted", async () => {
    // The store filters revoked rows, deleted and cancelado projects (see session-store.db.test.ts).
    store.findPortalProjectAccess.mockResolvedValue(null);
    const error = await requireProjectAccess(PROJECT_ID, user).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortalNotFoundError);
    expect(portalErrorResponse(error)?.status).toBe(404);
  });

  it("calls notFound() in pages", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    store.findActivePortalSession.mockResolvedValue(record(HOUR));
    store.findPortalProjectAccess.mockResolvedValue(null);
    await expect(requireProjectAccess(PROJECT_ID)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 for a malformed project id without querying", async () => {
    await expect(requireProjectAccess("not-a-uuid", user)).rejects.toBeInstanceOf(PortalNotFoundError);
    expect(store.findPortalProjectAccess).not.toHaveBeenCalled();
  });
});

describe("create and destroy", () => {
  it("stores only the token hash and sets an httpOnly 30-day portal cookie", async () => {
    const { token, expiresAt } = await createPortalSession("pu-1", { userAgent: "UA", ip: "10.0.0.1" });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(store.insertPortalSession).toHaveBeenCalledWith({
      tokenHash: hashPortalToken(token),
      portalUserId: "pu-1",
      expiresAt,
      userAgent: "UA",
      ip: "10.0.0.1",
    });
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(PORTAL_SESSION_TTL_MS - 60_000);
    expect(jar.set).toHaveBeenCalledWith(PORTAL_SESSION_COOKIE, token, expect.objectContaining({ httpOnly: true }));
    expect(jar.set).not.toHaveBeenCalledWith(SESSION_COOKIE, expect.anything(), expect.anything());
  });

  it("destroy deletes the row and clears only the portal cookie", async () => {
    jar.values.set(PORTAL_SESSION_COOKIE, "tok-1");
    jar.values.set(SESSION_COOKIE, "staff-tok");
    await destroyPortalSession();
    expect(store.deletePortalSessionByTokenHash).toHaveBeenCalledWith(hashPortalToken("tok-1"));
    expect(jar.delete).toHaveBeenCalledWith(PORTAL_SESSION_COOKIE);
    expect(jar.delete).not.toHaveBeenCalledWith(SESSION_COOKIE);
  });
});

describe("staff cookie is not a portal session", () => {
  it("ignores a staff session cookie entirely", async () => {
    jar.values.set(SESSION_COOKIE, "staff-token");
    expect(await getPortalUser()).toBeNull();
    expect(store.findActivePortalSession).not.toHaveBeenCalled();
    await expect(requirePortalApiUser()).rejects.toBeInstanceOf(PortalUnauthorizedError);
  });
});
