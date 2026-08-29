/**
 * E2E: Google Drive API routes — auth gating + graceful degradation.
 *
 * No service-account env vars are set in CI, so an authenticated request
 * should get 503 ("not configured"), not a crash. Unauthenticated → 401.
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Google Drive API", () => {
  test("list route: 401 without a session", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/google/drive/list`, {
      headers: { cookie: "" },
    });
    expect(res.status()).toBe(401);
  });

  test("list route: 503 when Drive is not configured (authenticated)", async ({
    page,
  }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);

    // Fetch from within the page so the httpOnly session cookie is sent.
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/google/drive/list?folderId=root");
      return { status: r.status, body: await r.json().catch(() => null) };
    });
    expect(result.status).toBe(503);
    expect(result.body?.error).toMatch(/not configured/i);
  });

  test("file route: 401 without a session", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/google/drive/file/abc123`,
      { headers: { cookie: "" } }
    );
    expect(res.status()).toBe(401);
  });

  test("status route: { configured: false } for an authed user with no SA env", async ({
    page,
  }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/google/drive/status");
      return { status: r.status, body: await r.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body.configured).toBe(false);
  });
});
