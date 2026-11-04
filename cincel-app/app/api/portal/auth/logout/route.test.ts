// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { destroyPortalSession } = vi.hoisted(() => ({ destroyPortalSession: vi.fn() }));

vi.mock("@/lib/portal/session", () => ({ destroyPortalSession }));

const { GET, POST } = await import("./route");

function get(query: string) {
  return GET(new NextRequest(`http://internal.host:3000/api/portal/auth/logout${query}`));
}

describe("/api/portal/auth/logout", () => {
  beforeEach(() => {
    destroyPortalSession.mockReset();
    destroyPortalSession.mockResolvedValue(undefined);
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("POST clears the portal session and answers 204", async () => {
    const res = await POST();
    expect(res.status).toBe(204);
    expect(destroyPortalSession).toHaveBeenCalledTimes(1);
  });

  it("GET clears the session and redirects to the encoded next", async () => {
    const res = await get("?next=%2Fportal%2Flogin%3Ferror%3Dlink");
    expect(destroyPortalSession).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.example.test/portal/login?error=link");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("GET falls back to /portal/login without next", async () => {
    const res = await get("");
    expect(res.headers.get("location")).toBe("https://app.example.test/portal/login");
  });

  it.each(["https%3A%2F%2Fevil.example.test", "%2F%2Fevil.example.test", "%2F%5Cevil", "portal"])(
    "GET falls back to /portal/login for open-redirect input %s",
    async (next) => {
      const res = await get(`?next=${next}`);
      expect(res.headers.get("location")).toBe("https://app.example.test/portal/login");
    }
  );

  it("GET never builds the target from the request host and is relative without APP_ORIGIN", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    const res = await get("?next=%2Fportal%2Flogin");
    expect(res.headers.get("location")).toBe("/portal/login");
  });
});
