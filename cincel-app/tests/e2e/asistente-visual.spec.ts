/**
 * E2E: the Visual layout of `/asistente` (frame `Asistente-Visual`): a fixed
 * full-height screen where only the rail and the log scroll and the composer
 * never moves, the log stays at the newest message, and at 390 px the rail
 * opens in a sheet.
 *
 * The chat route is answered by a fixture UI message stream (`page.route`),
 * so no LLM credentials are needed. Run locally with `CI=1`.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;

function sse(chunks: object[]): string {
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

function reply(n: number, paragraphs = 1): string {
  const text = Array.from({ length: paragraphs }, (_, i) => `Respuesta ${n}, párrafo ${i + 1}: todo en orden.`).join("\n\n");
  return sse([
    { type: "start", messageId: `a${n}` },
    { type: "start-step" },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { type: "finish-step" },
    { type: "finish" },
  ]);
}

/** Answers every chat request with a text reply (`paragraphs` long). */
async function stubChatRoute(page: Page, paragraphs = 1): Promise<void> {
  let n = 0;
  await page.route("**/api/asistente/chat", async (route) => {
    n += 1;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      body: reply(n, paragraphs),
    });
  });
}

async function pageScrolls(page: Page): Promise<{ vertical: boolean; horizontal: boolean }> {
  return page.evaluate(() => {
    const el = document.scrollingElement!;
    return { vertical: el.scrollHeight > window.innerHeight + 1, horizontal: el.scrollWidth > window.innerWidth + 1 };
  });
}

async function send(page: Page, text: string, n: number): Promise<void> {
  const input = page.getByLabel("Mensaje al asistente");
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByText(`Respuesta ${n}, párrafo 1`, { exact: false })).toBeVisible();
}

test.describe("Asistente · Visual", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("composer stays put after 30 messages", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubChatRoute(page);
    await page.goto(`${BASE_URL}/asistente?estilo=visual`, { waitUntil: "load" });

    const input = page.getByLabel("Mensaje al asistente");
    await expect(input).toBeVisible();
    await send(page, "Primera pregunta", 1);
    const before = await input.boundingBox();

    for (let n = 2; n <= 15; n++) await send(page, `Pregunta ${n}`, n);

    await expect(page.getByRole("log", { name: "Mensajes" }).getByRole("article")).toHaveCount(30);
    const after = await input.boundingBox();
    expect(Math.round(after?.y ?? 0)).toBe(Math.round(before?.y ?? 0));
    expect(await pageScrolls(page)).toEqual({ vertical: false, horizontal: false });
    await expect(input).toBeFocused();
    await expect(page.getByRole("button", { name: "Mensajes anteriores" })).toBeVisible();
  });

  test("log stays at the bottom while streaming", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubChatRoute(page, 12);
    await page.goto(`${BASE_URL}/asistente?estilo=visual`, { waitUntil: "load" });

    for (let n = 1; n <= 3; n++) await send(page, `Pregunta larga ${n}`, n);

    const log = page.getByRole("log", { name: "Mensajes" });
    // `column-reverse`: scrollTop 0 is the bottom.
    await expect.poll(() => log.evaluate((el) => Math.abs(el.scrollTop))).toBeLessThan(80);
    await expect(page.getByText("Respuesta 3, párrafo 12", { exact: false })).toBeInViewport();
    await expect(page.getByRole("button", { name: /Bajar al último mensaje/ })).toHaveCount(0);
  });

  test("390 px: rail opens in a sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubChatRoute(page);
    await page.goto(`${BASE_URL}/asistente?estilo=visual`, { waitUntil: "load" });

    await expect(page.getByLabel("Mensaje al asistente")).toBeVisible();
    await expect(page.getByLabel("Buscar conversaciones")).toBeHidden();

    await page.getByRole("button", { name: "Conversaciones" }).click();
    const sheet = page.getByRole("dialog", { name: "Conversaciones" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Buscar conversaciones")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await send(page, "Hola", 1);
    expect(await pageScrolls(page)).toEqual({ vertical: false, horizontal: false });
  });
});
