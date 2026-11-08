#!/usr/bin/env node
/**
 * Route timings for the staff app (issue 922): per main page, TTFB and LCP
 * of a cold load, the JS the browser downloads on that first load, and the
 * warm sidebar transition into it. Read only: it only opens pages and
 * clicks sidebar links.
 *
 * Needs a signed-in staff session (copy the `cincel_session` cookie from the
 * browser's devtools on the deployment being measured):
 *
 *   PERF_BASE_URL=https://<dev deployment> PERF_SESSION=<cookie value> \
 *     node scripts/perf/measure-routes.mjs
 *
 * Optional: PERF_ROUTES="/inicio,/tareas" PERF_RUNS=5 PERF_JSON=out.json
 * Budgets (issue 922): Inicio TTFB < 300 ms and LCP < 1500 ms; sidebar
 * transition between main pages < 500 ms warm. Exits 1 when one is missed.
 */
import { writeFileSync } from "node:fs";

import { chromium } from "playwright";

const BASE = (process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const SESSION = process.env.PERF_SESSION;
const ROUTES = (process.env.PERF_ROUTES ?? "/inicio,/tareas,/proyectos,/personas,/mi-espacio,/ajustes")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
const RUNS = Math.max(1, Number(process.env.PERF_RUNS ?? 5));

export const BUDGETS = { inicioTtfbMs: 300, inicioLcpMs: 1500, transitionMs: 500 };

if (!SESSION) {
  console.error("PERF_SESSION is required (the cincel_session cookie of a signed-in staff member).");
  process.exit(2);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? NaN : sorted[Math.floor(sorted.length / 2)];
};
const kb = (bytes) => Math.round(bytes / 102.4) / 10;

/** Cold load of one route in a fresh context: TTFB, LCP and first-load JS (transfer and decoded). */
async function coldLoad(browser, route) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname.startsWith("/login")) throw new Error("PERF_SESSION is not a valid session");
  // LCP is final once the page is hidden or the user interacts; a short wait is enough for a static page.
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const scripts = performance
      .getEntriesByType("resource")
      .filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"));
    return {
      ttfb: nav ? nav.responseStart - nav.requestStart : NaN,
      lcp: window.__lcp,
      jsTransfer: scripts.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      jsDecoded: scripts.reduce((sum, r) => sum + (r.decodedBodySize || 0), 0),
      jsFiles: scripts.length,
    };
  });
  await context.close();
  return metrics;
}

/** Warm sidebar transition: click the sidebar link of `to` from `from`, until its content replaces the skeleton. */
async function transition(page, from, to) {
  await page.goto(`${BASE}${from}`, { waitUntil: "networkidle" });
  const link = page.locator(`[data-sidebar="menu-button"][href="${to}"]`).first();
  // Not in this member's sidebar (e.g. Personas points at /personas/clientes for some roles).
  if ((await link.count()) === 0) return null;
  await link.hover();
  await page.waitForTimeout(300);
  const started = Date.now();
  await link.click();
  await page.waitForURL((url) => url.pathname === to || url.pathname.startsWith(`${to}/`));
  await page.waitForFunction(() => !document.querySelector('[data-slot="route-loading"]'));
  return Date.now() - started;
}

async function newContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { hostname, protocol } = new URL(BASE);
  await context.addCookies([
    { name: "cincel_session", value: SESSION, domain: hostname, path: "/", httpOnly: true, secure: protocol === "https:" },
  ]);
  return context;
}

const browser = await chromium.launch();
const results = [];
try {
  for (const route of ROUTES) {
    const cold = [];
    for (let i = 0; i < RUNS; i += 1) cold.push(await coldLoad(browser, route));
    results.push({
      route,
      ttfbMs: Math.round(median(cold.map((c) => c.ttfb))),
      lcpMs: Math.round(median(cold.map((c) => c.lcp))),
      firstLoadJsKb: kb(median(cold.map((c) => c.jsTransfer))),
      firstLoadJsDecodedKb: kb(median(cold.map((c) => c.jsDecoded))),
      jsFiles: median(cold.map((c) => c.jsFiles)),
    });
  }

  // Warm transitions: one context, every page visited once first so its code is cached.
  const context = await newContext(browser);
  const page = await context.newPage();
  for (const route of ROUTES) await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  for (const row of results) {
    const from = ROUTES[(ROUTES.indexOf(row.route) + ROUTES.length - 1) % ROUTES.length];
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) runs.push(await transition(page, from, row.route));
    row.transitionFrom = from;
    row.transitionMs = runs.includes(null) ? null : Math.round(median(runs));
  }
  await context.close();
} finally {
  await browser.close();
}

console.table(results);
if (process.env.PERF_JSON) writeFileSync(process.env.PERF_JSON, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));

const misses = [];
const inicio = results.find((r) => r.route === "/inicio");
if (inicio && inicio.ttfbMs >= BUDGETS.inicioTtfbMs) misses.push(`Inicio TTFB ${inicio.ttfbMs} ms ≥ ${BUDGETS.inicioTtfbMs}`);
if (inicio && inicio.lcpMs >= BUDGETS.inicioLcpMs) misses.push(`Inicio LCP ${inicio.lcpMs} ms ≥ ${BUDGETS.inicioLcpMs}`);
for (const r of results) {
  if (r.transitionMs !== null && r.transitionMs >= BUDGETS.transitionMs) misses.push(`${r.transitionFrom} → ${r.route} ${r.transitionMs} ms ≥ ${BUDGETS.transitionMs}`);
}
if (misses.length > 0) {
  console.error(`Over budget:\n- ${misses.join("\n- ")}`);
  process.exit(1);
}
console.log("All route budgets met.");
