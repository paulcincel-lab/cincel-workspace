/**
 * E2E (opt-in): the Esencial layout of `/asistente` against the real LLM.
 * Skipped unless RUN_LIVE_ASSISTANT=1, like `asistente-live.spec.ts`.
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;

test.describe("Asistente Esencial — live LLM", () => {
  test.skip(process.env.RUN_LIVE_ASSISTANT !== "1", "set RUN_LIVE_ASSISTANT=1 to run against a configured LLM");

  test("pinned composer, compact steps and no page scroll", async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/asistente?estilo=esencial`, { waitUntil: "domcontentloaded" });

    const input = page.getByLabel("Mensaje al asistente");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("list", { name: "Preguntas de ejemplo" })).toBeVisible();
    const before = await input.boundingBox();

    await input.fill("¿Qué tareas tengo vencidas? Responde en una frase.");
    await input.press("Enter");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");

    await expect(page.getByRole("article", { name: "Respuesta del asistente" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("button", { name: /Usó \d+ herramientas?/ }).first()).toBeVisible({ timeout: 90_000 });

    // The composer stays where it was and the page itself never scrolls.
    const after = await input.boundingBox();
    expect(Math.round(after?.y ?? 0)).toBe(Math.round(before?.y ?? 0));
    const scrolls = await page.evaluate(() => document.scrollingElement!.scrollHeight > window.innerHeight + 1);
    expect(scrolls).toBe(false);
  });
});
