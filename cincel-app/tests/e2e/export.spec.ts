/**
 * E2E: Export — triggers an Excel export from Directorio and verifies a file
 * is downloaded (file size > 0 confirms non-empty content was generated).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Exportación — directorio module", () => {
  test("Exportar ▼ button appears and triggers a download when clicked", async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/directorio`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("h1")).some((el) => el.textContent?.includes("Directorio")),
      { timeout: 30_000 }
    );

    // Open the export dropdown
    const exportButton = page.getByRole("button", { name: /Exportar/i }).first();
    await expect(exportButton).toBeVisible({ timeout: 15_000 });
    await exportButton.click();

    // Wait for Excel option and trigger download
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /Excel/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

    // Save and verify file is non-empty
    const path = await download.path();
    expect(path).not.toBeNull();
    if (path) {
      const { statSync } = await import("fs");
      const stat = statSync(path);
      expect(stat.size).toBeGreaterThan(0);
    }
  });
});
