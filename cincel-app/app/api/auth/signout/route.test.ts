// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { destroySessionMock } = vi.hoisted(() => ({
  destroySessionMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ destroySession: destroySessionMock }));

import { GET } from "./route";

function signout(query: string, headers: Record<string, string> = {}) {
  return GET(
    new NextRequest(`http://internal.host:3000/api/auth/signout${query}`, {
      headers,
    }),
  );
}

describe("GET /api/auth/signout", () => {
  beforeEach(() => {
    destroySessionMock.mockReset();
    destroySessionMock.mockResolvedValue(undefined);
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("clears the session and redirects to the encoded nested target on APP_ORIGIN", async () => {
    const res = await signout("?next=%2Flogin%2Fdenegado%3Fmotivo%3Drevoked");
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.example.test/login/denegado?motivo=revoked");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back to /login when next is missing", async () => {
    const res = await signout("");
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toBe("https://app.example.test/login");
  });

  it.each([
    "https%3A%2F%2Fevil.example.test%2Fx",
    "%2F%2Fevil.example.test",
    "%2F%5Cevil.example.test",
    "javascript%3Aalert(1)",
    "%2Flogin%0D%0ASet-Cookie%3Ax",
    "dashboard",
  ])("falls back to /login for open-redirect input %s", async (next) => {
    const res = await signout(`?next=${next}`);
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toBe("https://app.example.test/login");
  });

  it("never builds the target from the request host", async () => {
    const res = await signout("?next=%2Flogin", { host: "evil.example.test" });
    expect(res.headers.get("location")).toBe("https://app.example.test/login");
  });

  it("uses a relative Location when APP_ORIGIN is unset", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    const res = await signout("?next=%2Flogin");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("accepts cross-site GETs (review NB 4)", async () => {
    const res = await signout("?next=%2Flogin", {
      "sec-fetch-site": "cross-site",
    });
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.example.test/login");
  });
});
