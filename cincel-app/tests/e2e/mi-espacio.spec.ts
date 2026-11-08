/**
 * E2E: Mi espacio note / checklist / reminder flow (redesign FE §3.3, §17).
 * The reminder fires through a test call to `/api/cron/tick` and shows up in
 * the Bandeja.
 *
 * Needs `CRON_SECRET` in the environment (the same value the web server
 * reads). Run locally with `CI=1 npm run test:e2e -- mi-espacio`.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const TIME_ZONE = "America/Mexico_City";

function cronSecret(): string {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is not set. Use the value the web server under test reads.");
  return secret;
}

/** Current local date (`YYYY-MM-DD`) and minute (`HH:mm`) in the org time zone. */
function localNow(): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Opens /mi-espacio. */
async function openMiEspacio(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/mi-espacio`, { waitUntil: "load" });
  await expect(page).toHaveURL(/\/mi-espacio/);
  await expect(page.getByRole("heading", { name: "Mi espacio" })).toBeVisible();
}

test.describe("Mi espacio — nota, checklist y recordatorio", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("creates a note, a checklist and a reminder, and the fired reminder reaches Bandeja", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const noteText = `Idea de cocina ${stamp}`;
    const checklistTitle = `Comprar material ${stamp}`;
    const reminderText = `Llamar a Juanma ${stamp}`;

    await openMiEspacio(page);
    const capture = page.getByLabel("Captura rápida");

    // Nota
    await capture.fill(noteText);
    await capture.press("Enter");
    await expect(page.getByText("Nota guardada")).toBeVisible();
    await expect(page.getByText(noteText).first()).toBeVisible();

    // Checklist
    await capture.fill(`- [ ] ${checklistTitle}`);
    await capture.press("Enter");
    await expect(page.getByText("Checklist creado")).toBeVisible();
    await expect(page.getByText(checklistTitle).first()).toBeVisible();

    // Recordatorio, due this minute (the server accepts up to 60 s in the past).
    await capture.fill(reminderText);
    await page.getByRole("button", { name: "Recordatorio", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo recordatorio" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Recordatorio")).toHaveValue(reminderText);
    const now = localNow();
    await dialog.getByLabel("Fecha").fill(now.date);
    await dialog.getByLabel("Hora").fill(now.time);
    await dialog.getByRole("button", { name: "Crear recordatorio" }).click();
    await expect(page.getByText(/^Recordatorio creado para (hoy|mañana) \d{1,2}:\d{2}$/)).toBeVisible();
    await expect(dialog).toBeHidden();
    // Listed under "Recordatorios" (hoy y mañana) until it fires.
    await expect(page.getByText(reminderText).first()).toBeVisible();

    // Fire it through the cron tick (204 = another tick holds the lease; retry).
    await expect
      .poll(
        async () => {
          const res = await page.request.post(`${BASE_URL}/api/cron/tick`, {
            headers: { Authorization: `Bearer ${cronSecret()}` },
          });
          return res.status();
        },
        { timeout: 30_000, intervals: [1_000, 2_000, 5_000] }
      )
      .toBe(200);

    // Fired reminders leave the list; the in-app notification row shows it in Bandeja.
    await page.reload({ waitUntil: "load" });
    await expect(page.getByText("Bandeja").first()).toBeVisible();
    await expect(page.getByText(reminderText).first()).toBeVisible({ timeout: 15_000 });

    // The sidebar badge reads qk.shell.badges: mark-read on Mi espacio lowers it at once, and
    // navigating to Tareas shows the same count (no server render, no reload).
    const badge = page.locator("[data-slot=bandeja-badge]").first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    const count = async () => {
      if ((await page.locator("[data-slot=bandeja-badge]").count()) === 0) return 0;
      const text = await page.locator("[data-slot=bandeja-badge]").first().innerText();
      return Number(text.replace(/[^0-9]/g, "")) || 0;
    };
    const before = await count();
    expect(before).toBeGreaterThan(0);

    const unread = page.getByRole("link", { name: new RegExp(reminderText) }).first();
    await unread.click();
    await expect.poll(count, { timeout: 15_000 }).toBe(before - 1);

    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: /^Tareas/ }).click();
    await expect(page).toHaveURL(/\/tareas/);
    await expect.poll(count, { timeout: 15_000 }).toBe(before - 1);
  });

  test("the badges come from one private GET route, polled every 60 s", async ({ page }) => {
    test.setTimeout(120_000);
    const badgeGets: { url: string; cacheControl: string | undefined }[] = [];
    page.on("response", (response) => {
      if (response.request().method() === "GET" && new URL(response.url()).pathname === "/api/shell/badges") {
        badgeGets.push({ url: response.url(), cacheControl: response.headers()["cache-control"] });
      }
    });
    await page.goto(`${BASE_URL}/tareas`, { waitUntil: "load" });
    // Hydrated by the layout: no GET on load.
    expect(badgeGets).toEqual([]);
    await expect.poll(() => badgeGets.length, { timeout: 75_000, intervals: [5_000] }).toBeGreaterThanOrEqual(1);
    expect(badgeGets[0].cacheControl).toBe("private, no-store");
  });
});
