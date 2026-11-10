/**
 * E2E: the project shell (redesign FE §3.5): `/proyectos/<id>` opens on
 * Resumen with the project header and tabs, and every tab (Tareas,
 * Cronograma, Archivos, Ficha) opens under the same header with its tab
 * marked current. Cutto appears only as links, never embedded.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";

import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";
const PROJECT_NAME = `Proyecto Resumen E2E ${Date.now()}`;

let projectId = "";

/** A project in Presale, managed by the seeded admin (so the team row has a Cutto link). */
async function seedProject(): Promise<string> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [presale] = await sql`select id from core.workflows where key = 'presale' and deleted_at is null limit 1`;
    const [admin] = await sql`
      select id from core.staff
      where lower(email) = lower(${process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx"}) and deleted_at is null
      limit 1`;
    const [project] = await sql`
      insert into core.projects (name, current_workflow_id, status, project_type, address_city, manager_id)
      values (${PROJECT_NAME}, ${presale.id}, 'activo', 'Local comercial', 'CDMX', ${admin?.id ?? null})
      returning id`;
    await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
    return project.id as string;
  } finally {
    await sql.end();
  }
}

test.beforeAll(async () => {
  projectId = await seedProject();
});

test.describe("Proyecto · Resumen y pestañas", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("opens a project on Resumen and walks its tabs", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}$`));
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
    // Header (Estilos): back link and "{client} · {place} · entrega final {date}" (this project: place only).
    await expect(page.getByRole("link", { name: "← Proyectos" })).toHaveAttribute("href", /^\/proyectos/);
    await expect(page.getByText("CDMX", { exact: true })).toBeVisible();

    const tabs = page.getByRole("navigation", { name: "Secciones del proyecto" });
    await expect(tabs.getByRole("tab", { name: /^Resumen/ })).toHaveAttribute("aria-current", "page");
    // "Nueva tarea" opens the new-task sheet with this project, without leaving the page.
    await page.getByRole("button", { name: "Nueva tarea" }).first().click();
    await expect(page.getByRole("dialog", { name: "Nueva tarea" })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}$`));
    // Cutto stays a link that opens in a new tab, never an embed.
    await expect(page.locator("iframe[src*='cutto']")).toHaveCount(0);

    for (const [label, section] of [
      ["Tareas", "tareas"],
      ["Cronograma", "cronograma"],
      ["Archivos", "archivos"],
      ["Ficha", "ficha"],
      ["Resumen", ""],
    ] as const) {
      await test.step(label, async () => {
        await page
          .getByRole("navigation", { name: "Secciones del proyecto" })
          .getByRole("tab", { name: new RegExp(`^${label}`) })
          .click();
        const path = section ? `/proyectos/${projectId}/${section}` : `/proyectos/${projectId}`;
        await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 30_000 });
        await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
        await expect(
          page
            .getByRole("navigation", { name: "Secciones del proyecto" })
            .getByRole("tab", { name: new RegExp(`^${label}`) })
        ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
      });
    }
  });

  test("Ficha opens with its data rendered and a save shows without a reload", async ({ page }) => {
    // 5b (#960): the page prefetches the ficha, so there is no client-only loading state.
    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 2, name: "Ficha" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Cargando proyecto…")).toHaveCount(0);
    await expect(page.getByText("Local comercial", { exact: true })).toBeVisible();

    const origin = `Recomendación E2E ${Date.now()}`;
    let documentLoads = 0;
    page.on("request", (request) => {
      if (request.resourceType() === "document") documentLoads += 1;
    });

    await page.getByRole("button", { name: "Editar" }).click();
    // The admin fields come first for an administrator; Origen is a labelled input.
    await page.getByLabel("Origen").fill(origin);
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByRole("button", { name: "Editar" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(origin)).toBeVisible({ timeout: 15_000 });
    expect(documentLoads).toBe(0);
  });
});

/**
 * Counts the RSC fetches (`_rsc` / `RSC: 1`) and server-action POSTs (`next-action`) the page sends
 * from now on. Link prefetches (`Next-Router-Prefetch: 1`) are not renders of the current view and
 * fire whenever a link scrolls or un-hides into view, so they are left out.
 */
function trackServerRequests(page: import("@playwright/test").Page) {
  const counts = { rsc: 0, actions: 0 };
  page.on("request", (request) => {
    const headers = request.headers();
    if (request.method() === "POST" && headers["next-action"]) counts.actions += 1;
    else if (headers["next-router-prefetch"] === "1") return;
    else if (headers["rsc"] === "1" || request.url().includes("_rsc=")) counts.rsc += 1;
  });
  return counts;
}

test.describe("Proyectos · list, Resumen and Tareas on the query cache (5a, #959)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("hard load of /proyectos makes no action call after hydration", async ({ page }) => {
    const counts = trackServerRequests(page);
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible({ timeout: 30_000 });
    expect(counts.actions).toBe(0);
  });

  test("the portfolio search lives in ?q= and survives opening a project and going back", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "networkidle" });
    const search = page.getByLabel("Buscar proyecto o lugar");
    await expect(search).toBeVisible({ timeout: 30_000 });
    const counts = trackServerRequests(page);
    await search.fill(PROJECT_NAME);
    await expect(page).toHaveURL(/[?&]q=/, { timeout: 5_000 });
    // Typing filters the loaded rows: no server render for the search.
    expect(counts.rsc).toBe(0);
    expect(counts.actions).toBe(0);

    await page.getByRole("link", { name: PROJECT_NAME }).first().click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}$`), { timeout: 30_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/proyectos\?(.*&)?q=/, { timeout: 30_000 });
    await expect(page.getByLabel("Buscar proyecto o lugar")).toHaveValue(PROJECT_NAME);
  });

  test("closing ?nuevo=1 does not render the route on the server", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos?nuevo=1`, { waitUntil: "networkidle" });
    const dialog = page.getByRole("dialog", { name: "Nuevo proyecto" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const counts = trackServerRequests(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/proyectos$/);
    expect(counts.rsc).toBe(0);
  });

  test("Resumen → Ficha → Resumen within 30 s reuses the cached Resumen and shell", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
    const tabs = page.getByRole("navigation", { name: "Secciones del proyecto" });
    await tabs.getByRole("tab", { name: /^Ficha/ }).click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/ficha$`), { timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const counts = trackServerRequests(page);
    await tabs.getByRole("tab", { name: /^Resumen/ }).click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}$`), { timeout: 30_000 });
    await expect(tabs.getByRole("tab", { name: /^Resumen/ })).toHaveAttribute("aria-current", "page");
    await page.waitForLoadState("networkidle");
    // The Resumen and the shell come from the cache: no action call for either.
    expect(counts.actions).toBe(0);
  });

  test("project Tareas filters change the URL with no server render and no action call", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}/tareas`, { waitUntil: "networkidle" });
    const filters = page.getByRole("group", { name: "Filtros" });
    await expect(filters).toBeVisible({ timeout: 30_000 });
    const counts = trackServerRequests(page);
    await filters.getByText("Vencidas").click();
    await expect(page).toHaveURL(/estado=vencidas/);
    await filters.getByText("Todas").click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/tareas$`));
    expect(counts.rsc).toBe(0);
    expect(counts.actions).toBe(0);
  });

  test("opening and closing Nueva tarea from the project Tareas tab sends nothing", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}/tareas`, { waitUntil: "networkidle" });
    const add = page.getByRole("button", { name: /Agregar tarea/ }).first();
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Opening loads the dialog's catalogs; only closing must send nothing.
    // `waitForLoadState("networkidle")` resolves at once after the first load.
    await expect(dialog.getByText("Cargando…")).toHaveCount(0, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const counts = trackServerRequests(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.waitForLoadState("networkidle");
    expect(counts.rsc).toBe(0);
    expect(counts.actions).toBe(0);
  });
});

test.describe("Proyecto · Resumen Visual (#995)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("renders hero, cards and next tasks from the hydrated reads, with no action call", async ({ page }) => {
    const counts = trackServerRequests(page);
    await page.goto(`${BASE_URL}/proyectos/${projectId}?estilo=visual`, { waitUntil: "networkidle" });
    const hero = page.getByRole("region", { name: "Avance del proyecto" });
    await expect(hero).toBeVisible({ timeout: 30_000 });
    await expect(hero.getByRole("img", { name: /^Avance \d+ %/ })).toBeVisible();
    for (const name of ["Tareas por estatus", "Avance por tramo", "Equipo y carga", "Lo que sigue", "Actividad reciente", "Archivos"]) {
      await expect(page.getByRole("region", { name })).toBeVisible();
    }
    // Four reads prefetched and hydrated: the first render needs no action call.
    expect(counts.actions).toBe(0);
    // The back link keeps the style override.
    await expect(page.getByRole("link", { name: "← Proyectos" })).toHaveAttribute("href", "/proyectos?estilo=visual");
  });

  test("a quick-added task shows in «Lo que sigue» without a reload", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}?estilo=visual`, { waitUntil: "networkidle" });
    const next = page.getByRole("region", { name: "Lo que sigue" });
    await expect(next).toBeVisible({ timeout: 30_000 });
    let documentLoads = 0;
    page.on("request", (request) => {
      if (request.resourceType() === "document") documentLoads += 1;
    });
    const title = `Rápida E2E ${Date.now()}`;
    const input = next.getByRole("textbox", { name: /Nueva tarea en/ });
    await input.fill(title);
    await input.press("Enter");
    await expect(next.getByRole("link", { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 });
    expect(documentLoads).toBe(0);
  });

  test("390 px: no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/proyectos/${projectId}?estilo=visual`, { waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: "Avance del proyecto" })).toBeVisible({ timeout: 30_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
