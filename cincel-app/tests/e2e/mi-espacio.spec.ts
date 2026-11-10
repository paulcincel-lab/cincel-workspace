/**
 * E2E: Mi espacio note / checklist / reminder flow (redesign FE §3.3, §17).
 * The reminder fires through a test call to `/api/cron/tick` and shows up in
 * the Bandeja.
 *
 * Query Migration Phase 7 (#941): a checklist toggle, a mark-read and opening
 * an email are each one server-action POST with no RSC request (no route
 * re-render); the Bandeja tab is the URL only.
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

/**
 * Counts the server-action POSTs (`Next-Action` header) and the RSC requests
 * (`RSC: 1` or `?_rsc=`, a route render) the page sends from now on.
 */
function trackRequests(page: Page): { actions: string[]; rsc: string[]; reset(): void } {
  const actions: string[] = [];
  const rsc: string[] = [];
  page.on("request", (req) => {
    const headers = req.headers();
    if (req.method() === "POST" && headers["next-action"]) actions.push(headers["next-action"]);
    else if (headers["rsc"] === "1" || req.url().includes("_rsc=")) rsc.push(req.url());
  });
  return {
    actions,
    rsc,
    reset() {
      actions.length = 0;
      rsc.length = 0;
    },
  };
}

/** Opens /mi-espacio; `search` picks a style (`?estilo=…`), default Visual. */
async function openMiEspacio(page: Page, search = ""): Promise<void> {
  await page.goto(`${BASE_URL}/mi-espacio${search}`, { waitUntil: "load" });
  await expect(page).toHaveURL(/\/mi-espacio/);
  await expect(page.getByRole("heading", { name: "Mi espacio", level: 1 })).toBeVisible();
}

/** Analítico: the quick capture opens from "Captura rápida" in the header; checklists open in a sheet. */
const CAPTURE_STYLE = "?estilo=analitico";

/** Analítico: opens the header popover and returns the quick-capture field. */
async function openCapture(page: Page) {
  await page.getByRole("button", { name: "Captura rápida" }).click();
  const capture = page.getByLabel("Captura rápida");
  await expect(capture).toBeVisible();
  return capture;
}

/** Analítico: opens a checklist of the Checklists table in its sheet. */
async function openChecklistSheet(page: Page, title: string): Promise<void> {
  await page.getByRole("region", { name: /^Checklists/ }).getByRole("button", { name: title }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
}

/** Visual: "Abrir →" on the Bandeja card expands the full Bandeja (tabs, Gmail). */
async function openFullInbox(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Abrir →" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Cerrar ↑" })).toHaveAttribute("aria-expanded", "true");
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

    await openMiEspacio(page, CAPTURE_STYLE);
    const capture = await openCapture(page);

    // Nota (Analítico lists no notes: the toast confirms it)
    await capture.fill(noteText);
    await capture.press("Enter");
    await expect(page.getByText("Nota guardada")).toBeVisible();

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

    // The in-app notification row shows it in the full Bandeja (Visual).
    await openMiEspacio(page);
    await openFullInbox(page);
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

  test("toggling a checklist item is one action POST, optimistic, with no RSC request", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const title = `Visita ${stamp}`;
    const point = `Medir vanos ${stamp}`;

    await openMiEspacio(page, CAPTURE_STYLE);
    const capture = await openCapture(page);
    await capture.fill(`- [ ] ${title} - [ ] ${point}`);
    await capture.press("Enter");
    await expect(page.getByText("Checklist creado")).toBeVisible();
    await page.keyboard.press("Escape");
    await openChecklistSheet(page, title);
    const box = page.getByRole("checkbox", { name: point });
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute("aria-checked", "false");

    const requests = trackRequests(page);
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => requests.actions.length).toBe(1);
    // Give a stray revalidation time to show up.
    await page.waitForTimeout(1_500);
    expect(requests.actions).toHaveLength(1);
    expect(requests.rsc).toEqual([]);

    // The saved state survives a reload.
    await page.reload({ waitUntil: "load" });
    await openChecklistSheet(page, title);
    await expect(page.getByRole("checkbox", { name: point })).toHaveAttribute("aria-checked", "true");
  });

  test("the Bandeja tab is the URL only: switching tabs sends no request", async ({ page }) => {
    await openMiEspacio(page);
    await openFullInbox(page);
    const tabs = page.getByRole("navigation", { name: "Pestañas de la bandeja" });
    const requests = trackRequests(page);
    await tabs.getByRole("link", { name: /Notificaciones/ }).click();
    await expect(page).toHaveURL(/bandeja=notificaciones/);
    await expect(tabs.getByRole("link", { name: /Notificaciones/ })).toHaveAttribute("aria-current", "page");
    await page.waitForTimeout(1_000);
    expect(requests.rsc).toEqual([]);
    expect(requests.actions).toEqual([]);
  });

  test("marking a notification read is one action POST and the counts drop at once", async ({ page }) => {
    await openMiEspacio(page);
    await openFullInbox(page);
    const tabs = page.getByRole("navigation", { name: "Pestañas de la bandeja" });
    await tabs.getByRole("link", { name: /Notificaciones/ }).click();
    await expect(page).toHaveURL(/bandeja=notificaciones/);

    const unread = page.locator("a, button").filter({ hasText: /^Sin leer: / }).first();
    test.skip((await unread.count()) === 0, "This user has no unread notification to mark read.");
    const count = page.getByTestId("inbox-count-notificaciones");
    const before = Number((await count.textContent())?.match(/\d+/)?.[0] ?? "0");

    const requests = trackRequests(page);
    // Ctrl/Cmd+click: the row marks itself read while its link opens in another tab, so this page stays.
    await unread.click({ modifiers: ["ControlOrMeta"] });
    await expect.poll(() => requests.actions.length).toBe(1);
    if (before > 1) await expect(count).toContainText(String(before - 1));
    else await expect(count).toBeHidden();
    await page.waitForTimeout(1_000);
    expect(requests.rsc).toEqual([]);
  });

  test("opening an unread email is one read + one mark-read POST, with no RSC request", async ({ page }) => {
    await openMiEspacio(page);
    await openFullInbox(page);
    const tabs = page.getByRole("navigation", { name: "Pestañas de la bandeja" });
    const gmailTab = tabs.getByRole("link", { name: /Gmail/ });
    test.skip((await gmailTab.count()) === 0, "Gmail is not enabled.");
    await gmailTab.click();
    await expect(page).toHaveURL(/bandeja=gmail/);
    const connect = page.getByRole("link", { name: "Conectar Gmail" });
    test.skip((await connect.count()) > 0, "Gmail is not connected for this user.");

    const unread = page.getByRole("button").filter({ hasText: /^Sin leer: / }).first();
    test.skip((await unread.count()) === 0, "No unread Gmail thread to open.");

    const subject = ((await unread.textContent()) ?? "").replace(/^Sin leer: /, "").trim();

    const requests = trackRequests(page);
    await unread.click();
    await expect(page).toHaveURL(/correo=/);
    await expect(page.locator('section[aria-label="Correo abierto"]').first()).toBeVisible();
    // The live read, then the mark-read mutation.
    await expect.poll(() => requests.actions.length, { timeout: 15_000 }).toBe(2);
    await page.waitForTimeout(1_000);
    expect(requests.actions).toHaveLength(2);
    expect(requests.rsc).toEqual([]);

    // Back and open again within the stale time: no call.
    await page.getByRole("button", { name: "Volver a la bandeja" }).click();
    requests.reset();
    await page.getByRole("button").filter({ hasText: subject }).first().click();
    await expect(page).toHaveURL(/correo=/);
    await page.waitForTimeout(1_000);
    expect(requests.actions).toEqual([]);
    expect(requests.rsc).toEqual([]);
  });

  test("Visual: day hero, Mis tareas board, Bandeja and hours, with no request on load", async ({ page }) => {
    const requests = trackRequests(page);
    await openMiEspacio(page);
    // Seeded on the server: the first render needs no action call.
    expect(requests.actions).toEqual([]);
    const hero = page.getByRole("region", { name: "Mi día" });
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { name: /^Buen(os días|as tardes|as noches)/ })).toBeVisible();
    await expect(hero.getByRole("link", { name: /para hoy$/ })).toBeVisible();
    for (const column of ["Hoy", "Esta semana", "Después"]) {
      await expect(page.getByRole("list", { name: column })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Bandeja" })).toBeVisible();

    // 390 px: no horizontal scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("Analítico: KPIs, Mis tareas, Horas and Checklists, with the filters in the URL", async ({ page }) => {
    await openMiEspacio(page, CAPTURE_STYLE);
    await expect(page.getByText("Mis abiertas")).toBeVisible();
    for (const section of [/^Mis tareas/, /^Horas de la semana/, /^Checklists/]) {
      await expect(page.getByRole("region", { name: section })).toBeVisible();
    }
    await page.getByRole("radio", { name: /En retraso/ }).click();
    await expect(page).toHaveURL(/estado=retraso/);
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("radio", { name: /En retraso/ })).toHaveAttribute("aria-checked", "true");

    // 390 px: no horizontal page scroll (tables scroll inside their cards).
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
