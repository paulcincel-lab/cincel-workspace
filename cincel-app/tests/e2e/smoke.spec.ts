/**
 * E2E: sign in through the real login form and land on Inicio (redesign FE
 * §3.2). `/dashboard` redirects to `/inicio` (in the proxy), which greets the viewer by hour.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;

test.describe("Acceso — login e Inicio", () => {
  test("an admin signs in and lands on Inicio", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^(Buenos días|Buenas tardes|Buenas noches)/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("old URLs redirect in the proxy, before the staff layout renders", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    const cases: [string, string][] = [
      ["/dashboard", "/inicio"],
      ["/tablero?proyecto=p1", "/tareas?vista=tablero&proyecto=p1"],
      ["/equipo", "/personas"],
      ["/configuracion/general", "/ajustes/general"],
    ];
    for (const [from, to] of cases) {
      // One hop, answered by the proxy: a redirect with no page body.
      const response = await page.request.get(`${BASE_URL}${from}`, { maxRedirects: 0 });
      expect(response.status(), from).toBe(307);
      const location = new URL(response.headers()["location"] ?? "", BASE_URL);
      expect(`${location.pathname}${location.search}`, from).toBe(to);
    }
    await page.goto(`${BASE_URL}/equipo`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/personas/, { timeout: 30_000 });
  });

  test("Inicio renders its KPIs and agenda from the hydrated query", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);

    // Server-action calls carry a `next-action` header; a hard load hydrates Inicio without any.
    const actionPosts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) actionPosts.push(request.url());
    });

    await page.goto(`${BASE_URL}/inicio`, { waitUntil: "networkidle" });
    for (const label of ["Proyectos activos", "Vencidas", "Bloqueadas"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByText("Mi día", { exact: true }).first()).toBeVisible();
    expect(actionPosts).toEqual([]);
  });
});
