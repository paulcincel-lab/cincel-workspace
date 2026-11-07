// @vitest-environment node
/** POST/GET /api/cron/tick (redesign BE §13): 503 / 401 / 204 / 200. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runTick = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cron/tick", () => ({ runTick }));
vi.mock("@/lib/cron/jobs", () => ({}));

import { GET, POST } from "@/app/api/cron/tick/route";

const SECRET = "s3cret-cron-value";

function request(method: "POST" | "GET", authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new NextRequest("http://app:3000/api/cron/tick", { method, headers });
}

describe("/api/cron/tick", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    runTick.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers 503 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(request("POST", `Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "DISABLED" });
    expect(runTick).not.toHaveBeenCalled();
  });

  it("answers 401 without an Authorization header", async () => {
    const res = await POST(request("POST"));
    expect(res.status).toBe(401);
    expect(runTick).not.toHaveBeenCalled();
  });

  it("answers 401 with a wrong secret", async () => {
    const res = await POST(request("POST", "Bearer wrong"));
    expect(res.status).toBe(401);
    expect(runTick).not.toHaveBeenCalled();
  });

  it("answers 401 with a secret that only shares a prefix", async () => {
    const res = await POST(request("POST", `Bearer ${SECRET}x`));
    expect(res.status).toBe(401);
  });

  it("answers 401 for a non-Bearer scheme", async () => {
    const res = await POST(request("POST", `Basic ${SECRET}`));
    expect(res.status).toBe(401);
    expect(runTick).not.toHaveBeenCalled();
  });

  it("answers 204 when another tick holds the lease", async () => {
    runTick.mockResolvedValue({ acquired: false, ran: [], skipped: [] });
    const res = await POST(request("POST", `Bearer ${SECRET}`));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("answers 200 with the job report", async () => {
    const ran = [{ job: "notifications-deliver", ms: 12, count: 3 }];
    const skipped = [{ job: "daily-digest", reason: "not_due" }];
    runTick.mockResolvedValue({ acquired: true, ran, skipped });

    const res = await POST(request("POST", `Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran, skipped });
    expect(runTick).toHaveBeenCalledTimes(1);
    expect(runTick.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it("GET behaves like POST", async () => {
    runTick.mockResolvedValue({ acquired: true, ran: [], skipped: [] });
    expect((await GET(request("GET", `Bearer ${SECRET}`))).status).toBe(200);
    expect((await GET(request("GET", "Bearer nope"))).status).toBe(401);
  });
});
