/**
 * E2E: Visual motion causes no layout shift (Estilos #985). On Inicio and the
 * Tareas board in Visual, the entrance animations (`anim-in`, `rise`, `draw`,
 * `grow`, `grow-x`, `ring`, `ring-in`) only touch transform, opacity and
 * stroke-dashoffset, so the cumulative layout shift measured while they run
 * is 0. At 390 px the board scrolls inside its own container, never the page.
 *
 * Layout shifts are recorded from the first paint (an init script registers a
 * `layout-shift` observer before any page code runs); the score only counts
 * the shifts after the page content is on screen, so the data load itself
 * (skeleton to content) is not part of the check.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";
import { BASE_URL } from "./helpers/redesign";

/** Longest entrance: `draw` 1.2 s + 0.2 s delay + the 400 ms stagger cap, with margin. */
const ANIMATION_WINDOW_MS = 2_500;

/** CSS properties the motion utilities may animate (no layout properties). */
const PAINT_ONLY = [
  "transform",
  "opacity",
  "strokeDashoffset",
  "stroke-dashoffset",
  "backgroundColor",
  "background-color",
  "boxShadow",
  "box-shadow",
  // Keyframe metadata, not properties.
  "offset",
  "easing",
  "composite",
  "computedOffset",
];

type ShiftWindow = Window & { __shifts?: { value: number; startTime: number }[] };

async function recordLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as ShiftWindow;
    target.__shifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) target.__shifts!.push({ value: entry.value, startTime: entry.startTime });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // Browsers without the Layout Instability API record nothing.
    }
  });
}

/** Sum of the layout shifts recorded after `since` (a `performance.now()` value). */
async function shiftSince(page: Page, since: number): Promise<number> {
  return page.evaluate(
    (from) => ((window as ShiftWindow).__shifts ?? []).filter((s) => s.startTime >= from).reduce((sum, s) => sum + s.value, 0),
    since,
  );
}

/** Properties animated by the CSS animations running on the page that are not paint-only. */
async function layoutAnimatedProperties(page: Page, allowed: string[]): Promise<string[]> {
  return page.evaluate((ok) => {
    const allowedSet = new Set(ok);
    const found = new Set<string>();
    for (const animation of document.getAnimations()) {
      const effect = animation.effect as KeyframeEffect | null;
      if (!effect || typeof effect.getKeyframes !== "function") continue;
      for (const frame of effect.getKeyframes()) {
        for (const key of Object.keys(frame)) if (!allowedSet.has(key)) found.add(key);
      }
    }
    return [...found];
  }, allowed);
}

async function now(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

test.describe("Visual motion · no layout shift", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await recordLayoutShifts(page);
  });

  test("Inicio animates with CLS 0", async ({ page }) => {
    await page.goto(`${BASE_URL}/inicio?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "Saludo" })).toBeVisible({ timeout: 30_000 });
    const since = await now(page);

    expect(await layoutAnimatedProperties(page, PAINT_ONLY)).toEqual([]);
    await page.waitForTimeout(ANIMATION_WINDOW_MS);
    expect(await shiftSince(page, since)).toBe(0);
  });

  test("Tareas board animates with CLS 0", async ({ page }) => {
    await page.goto(`${BASE_URL}/tareas?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: /^Pendiente, / }).first()).toBeVisible({ timeout: 30_000 });
    const since = await now(page);

    expect(await layoutAnimatedProperties(page, PAINT_ONLY)).toEqual([]);
    await page.waitForTimeout(ANIMATION_WINDOW_MS);
    expect(await shiftSince(page, since)).toBe(0);
  });

  test("Tareas board scrolls inside its container at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/tareas?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: /^Pendiente, / }).first()).toBeVisible({ timeout: 30_000 });

    const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(pageScrolls).toBe(false);
  });

  test("reduced motion shows the final state with no running animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${BASE_URL}/inicio?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "Saludo" })).toBeVisible({ timeout: 30_000 });

    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a instanceof CSSAnimation &&
              ["fadeSlide", "riseIn", "liftIn", "draw", "grow", "growX", "ring", "ringIn"].includes(a.animationName),
          ).length,
    );
    expect(running).toBe(0);
  });
});
