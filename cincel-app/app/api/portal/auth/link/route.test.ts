// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/portal/auth/link over a fake link store: the same answer for
 * known and unknown emails, mail only for a known user, and the rate limits.
 */

const mocks = vi.hoisted(() => ({
  issuePortalLoginLink: vi.fn(),
  sendMail: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => mocks.afterCallbacks.push(callback),
}));
vi.mock("@/lib/portal/login-links", () => ({ issuePortalLoginLink: mocks.issuePortalLoginLink }));
vi.mock("@/lib/email", () => ({ sendMail: mocks.sendMail }));

const { POST } = await import("./route");
const { portalLinkEmailRateLimiter, portalLinkIpRateLimiter, PORTAL_LINK_SENT_MESSAGE } = await import(
  "@/lib/portal/auth-flow"
);

const TOKEN = "f".repeat(64);

function request(body: unknown, ip = "10.0.0.1") {
  return POST(
    new NextRequest("http://internal.host:3000/api/portal/auth/link", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

async function runAfter() {
  for (const callback of mocks.afterCallbacks.splice(0)) await callback();
}

describe("POST /api/portal/auth/link", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
    portalLinkEmailRateLimiter.reset();
    portalLinkIpRateLimiter.reset();
    mocks.afterCallbacks.length = 0;
    mocks.sendMail.mockReset();
    mocks.sendMail.mockResolvedValue({ sent: true });
    mocks.issuePortalLoginLink.mockReset();
    mocks.issuePortalLoginLink.mockImplementation(async ({ email }: { email: string }) =>
      email === "cliente@gmail.com" ? { token: TOKEN, email, name: "Cliente" } : null
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("emails a known user the /portal/acceder link after the response", async () => {
    const res = await request({ email: " Cliente@Gmail.com ", return_to: "/portal/proyectos/1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: PORTAL_LINK_SENT_MESSAGE });
    expect(mocks.issuePortalLoginLink).toHaveBeenCalledExactlyOnceWith({
      email: "cliente@gmail.com",
      returnTo: "/portal/proyectos/1",
      ip: "10.0.0.1",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();

    await runAfter();
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const message = mocks.sendMail.mock.calls[0][0];
    expect(message.to).toBe("cliente@gmail.com");
    expect(message.text).toContain(`https://app.example.test/portal/acceder?token=${TOKEN}`);
  });

  it("answers an unknown or disabled email the same way and sends nothing (§B.8 #2)", async () => {
    const known = await request({ email: "cliente@gmail.com" });
    const unknown = await request({ email: "nadie@gmail.com" });
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(mocks.issuePortalLoginLink).toHaveBeenCalledTimes(2);

    mocks.afterCallbacks.splice(0, 1);
    await runAfter();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("drops an unsafe or non-portal return_to", async () => {
    await request({ email: "cliente@gmail.com", return_to: "https://evil.example.test/portal" });
    await request({ email: "cliente@gmail.com", return_to: "/dashboard" });
    expect(mocks.issuePortalLoginLink.mock.calls.map(([input]) => input.returnTo)).toEqual([null, null]);
  });

  it("rejects a missing or malformed email with 400", async () => {
    expect((await request({})).status).toBe(400);
    expect((await request({ email: "cliente" })).status).toBe(400);
    expect((await request("not json")).status).toBe(400);
    expect(mocks.issuePortalLoginLink).not.toHaveBeenCalled();
  });

  it("returns 429 on the sixth request in an hour for one email (§B.8 #11)", async () => {
    for (let i = 0; i < 5; i++) expect((await request({ email: "nadie@gmail.com" }, `10.0.1.${i}`)).status).toBe(200);
    const res = await request({ email: "NADIE@gmail.com" }, "10.0.2.1");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
    expect(mocks.issuePortalLoginLink).toHaveBeenCalledTimes(5);
  });

  it("returns 429 past 20 requests in an hour from one IP", async () => {
    for (let i = 0; i < 20; i++) expect((await request({ email: `c${i}@gmail.com` })).status).toBe(200);
    expect((await request({ email: "otro@gmail.com" })).status).toBe(429);
  });
});
