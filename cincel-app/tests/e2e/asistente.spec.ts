/**
 * E2E: AI assistant — auth gating + graceful degradation.
 *
 * No LLM_* env vars in CI, so the chat route returns 503 for an authenticated
 * user. Unauthenticated → 401; the page redirects to /login.
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Asistente", () => {
  test("chat route: 401 without a session", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/asistente/chat`, {
      headers: { cookie: "" },
      data: { messages: [] },
    });
    expect(res.status()).toBe(401);
  });

  test("page redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto(`${BASE_URL}/asistente`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);
  });

  test("authenticated: page renders and chat route degrades to 503", async ({
    page,
  }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);

    await page.goto(`${BASE_URL}/asistente`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Asistente", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder("Escribe tu pregunta…")).toBeVisible();

    const result = await page.evaluate(async () => {
      const r = await fetch("/api/asistente/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    });
    expect(result.status).toBe(503);
    expect(result.body?.error).toMatch(/no está configurado/i);
  });
});
