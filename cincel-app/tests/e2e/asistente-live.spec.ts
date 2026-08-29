/**
 * E2E (opt-in): drives the real LLM. Skipped unless RUN_LIVE_ASSISTANT=1,
 * so it never runs in CI (no LLM_* env there). Run locally against a
 * standalone server that has LLM_BASE_URL / LLM_API_KEY / LLM_MODEL set.
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Asistente — live LLM", () => {
  test.skip(
    process.env.RUN_LIVE_ASSISTANT !== "1",
    "set RUN_LIVE_ASSISTANT=1 to run against a configured LLM"
  );

  test("asks a question and streams an assistant reply", async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/asistente`, { waitUntil: "domcontentloaded" });

    const input = page.getByPlaceholder("Escribe tu pregunta…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("¿Qué proyectos activos tenemos? Responde en una frase.");
    await page.getByRole("button", { name: /Enviar|Pensando|Respondiendo/ }).click();

    // The user bubble, then an assistant bubble with non-empty text.
    await expect(page.getByText("¿Qué proyectos activos tenemos? Responde en una frase.")).toBeVisible();
    await expect
      .poll(
        async () => {
          const paras = await page.locator("div.overflow-y-auto p, div.overflow-y-auto li").allInnerTexts();
          return paras.join(" ").length;
        },
        { timeout: 90_000, message: "assistant never produced text" }
      )
      .toBeGreaterThan(5);

    // Button returns to idle when the stream finishes.
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible({ timeout: 90_000 });
  });

  test("a comparison question renders a recharts chart", async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/asistente`, { waitUntil: "domcontentloaded" });

    const input = page.getByPlaceholder("Escribe tu pregunta…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill(
      "Compara el avance (progress) de los proyectos activos en una gráfica de barras."
    );
    await page.getByRole("button", { name: /Enviar|Pensando|Respondiendo/ }).click();

    // render_chart → <AssistantChartMessage> → an <svg class="recharts-surface">
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible({
      timeout: 120_000,
    });
  });
});
