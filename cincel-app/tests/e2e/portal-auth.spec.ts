/**
 * E2E: portal sign-in page (R8-04, canvas `PortalLogin`).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { resolve } from "node:path";

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: resolve(process.cwd(), "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const results = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document);
    return results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  });
}

test.describe("Portal — acceso", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`sign-in page renders at 390 px without horizontal scroll and passes axe (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE_URL}/portal/login`, { waitUntil: "domcontentloaded" });

      await expect(page.getByLabel("Correo")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Enviar enlace/ })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await seriousAxeViolations(page)).toEqual([]);
    });
  }

  test("an expired link shows the notice and keeps the prefilled email", async ({ page }) => {
    await page.goto(`${BASE_URL}/portal/login?error=link&email=e2e-portal%40example.com`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("El enlace ya no es válido. Pide uno nuevo.")).toBeVisible();
    await expect(page.getByLabel("Correo")).toHaveValue("e2e-portal@example.com");
  });

  test("requesting a link shows Revisa tu correo with the same answer for any address", async ({ page }) => {
    const email = `e2e-portal-${Date.now()}@example.com`;
    await page.goto(`${BASE_URL}/portal/login`, { waitUntil: "domcontentloaded" });

    await page.getByLabel("Correo").fill(email);
    await page.getByRole("button", { name: /^Enviar enlace/ }).click();

    await expect(page.getByText("Revisa tu correo")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("button", { name: /Reenviar enlace en \d+ s/ })).toBeDisabled();
  });

  test("a protected portal page without a session goes to the sign-in page", async ({ page }) => {
    await page.goto(`${BASE_URL}/portal/no-existe`, { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/portal\/login/);
  });
});
