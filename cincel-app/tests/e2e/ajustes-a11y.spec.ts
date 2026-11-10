/**
 * E2E: one axe check per theme (redesign FE §16, §18 item 13). A collaborator's Ajustes › Apariencia
 * page — the shell (sidebar, header, assistant button) plus a settings form — has no serious or
 * critical violation in Azul Cincel, Cálido and Grafito. Light mode in every case.
 *
 * The theme is the viewer's own preference (`user_preferences.theme`), set in the DB before signing
 * in; the org lets users pick their theme by default (`allowUserOverride`). The collaborator is an
 * E2E row, removed by global-cleanup with its preferences.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createStaffUser,
  expectAxeClean,
  setAppearanceFor,
  signedInContext,
  type ThemeChoice,
} from "./helpers/redesign";

const THEMES: ThemeChoice[] = ["azul", "calido", "grafito"];
const PAGE = "/ajustes/apariencia";

test.describe("Accesibilidad — un tema a la vez", () => {
  for (const theme of THEMES) {
    test(`${PAGE} is axe clean — ${theme}`, async ({ browser }) => {
      const viewer = await createStaffUser({ tag: `Axe${theme}`, role: "Colaborador" });
      await setAppearanceFor(viewer.email, { theme, mode: "light" });
      const { context, page } = await signedInContext(browser, viewer, { colorScheme: "light" });
      try {
        await page.goto(`${BASE_URL}${PAGE}`, { waitUntil: "load" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme-id")))
          .toBe(theme);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
          .toBe("light");
        await page.waitForLoadState("networkidle");
        await expectAxeClean(page, `${PAGE} (${theme})`);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("Accesibilidad — Ajustes › Notificaciones", () => {
  const NOTIFICACIONES = "/ajustes/notificaciones";

  test(`${NOTIFICACIONES} shows one header and one nav and is axe clean`, async ({ browser }) => {
    const viewer = await createStaffUser({ tag: "AxeNotif", role: "Colaborador" });
    await setAppearanceFor(viewer.email, { theme: "azul", mode: "light" });
    const { context, page } = await signedInContext(browser, viewer, { colorScheme: "light" });
    try {
      await page.goto(`${BASE_URL}${NOTIFICACIONES}`, { waitUntil: "load" });
      await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Qué te avisamos y por dónde" })).toBeVisible();
      // The Ajustes layout renders the header and the nav once (#949).
      await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: /ajustes/i })).toHaveCount(1);
      await page.waitForLoadState("networkidle");
      await expectAxeClean(page, NOTIFICACIONES);
    } finally {
      await context.close();
    }
  });
});

test.describe("Accesibilidad — Ajustes › Estatus y Permisos (catálogos)", () => {
  const ESTATUS = "/ajustes/estatus";
  const PERMISOS = "/ajustes/permisos";
  const LEGACY_MATRIX_KEY = "cincel.permissions.custom.v1";

  test(`${ESTATUS} renders hydrated (no page-data POST on load) and is axe clean`, async ({ browser }) => {
    const admin = await createStaffUser({ tag: "AxeEstatus", role: "Administrador" });
    await setAppearanceFor(admin.email, { theme: "azul", mode: "light" });
    const { context, page } = await signedInContext(browser, admin, { colorScheme: "light" });
    try {
      let actionPosts = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.headers()["next-action"]) actionPosts += 1;
      });
      await page.goto(`${BASE_URL}${ESTATUS}`, { waitUntil: "load" });
      await expect(page.getByRole("heading", { name: "Estatus personalizados", exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForLoadState("networkidle");
      expect(actionPosts, "page-data POSTs on load").toBe(0);
      await expectAxeClean(page, ESTATUS);
    } finally {
      await context.close();
    }
  });

  test(`${PERMISOS} is a read-only summary, drops the browser matrix, and is axe clean`, async ({ browser }) => {
    const admin = await createStaffUser({ tag: "AxePermisos", role: "Administrador" });
    await setAppearanceFor(admin.email, { theme: "azul", mode: "light" });
    const { context, page } = await signedInContext(browser, admin, { colorScheme: "light" });
    try {
      // A matrix the removed editor saved in this browser (#950).
      await page.evaluate(
        (key) => window.localStorage.setItem(key, JSON.stringify({ version: 1, roles: {} })),
        LEGACY_MATRIX_KEY,
      );
      await page.goto(`${BASE_URL}${PERMISOS}`, { waitUntil: "load" });
      await expect(page.getByRole("heading", { name: "Personas por acceso" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: /Configurar/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Restaurar permisos por defecto" })).toHaveCount(0);
      await expect
        .poll(() => page.evaluate((key) => window.localStorage.getItem(key), LEGACY_MATRIX_KEY))
        .toBeNull();
      await page.waitForLoadState("networkidle");

      // Switching windows and back refetches nothing.
      let requests = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" || request.url().includes("_rsc")) requests += 1;
      });
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForLoadState("networkidle");
      expect(requests, "requests after focus").toBe(0);

      await expectAxeClean(page, PERMISOS);
    } finally {
      await context.close();
    }
  });
});

test.describe("Accesibilidad — Ajustes › Organización (General, Tema, Horario, Google)", () => {
  const SEGMENTS = [
    { path: "/ajustes/general", ready: { role: "button", name: "Guardar cambios" } },
    { path: "/ajustes/tema", ready: { role: "button", name: "Publicar para todos" } },
    { path: "/ajustes/horario", ready: { role: "radiogroup", name: "Control de horario" } },
    { path: "/ajustes/google", ready: { role: "heading", name: "Grupos de Google" } },
  ] as const;

  for (const { path, ready } of SEGMENTS) {
    test(`${path} renders hydrated (no action POST on load) and is axe clean`, async ({ browser }) => {
      const admin = await createStaffUser({ tag: `AxeOrg${path.split("/").pop()}`, role: "Administrador" });
      await setAppearanceFor(admin.email, { theme: "azul", mode: "light" });
      const { context, page } = await signedInContext(browser, admin, { colorScheme: "light" });
      try {
        let actionPosts = 0;
        page.on("request", (request) => {
          if (request.method() === "POST" && request.headers()["next-action"]) actionPosts += 1;
        });
        await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
        await expect(page.getByRole(ready.role, { name: ready.name })).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState("networkidle");
        expect(actionPosts, "action POSTs on load").toBe(0);
        await expectAxeClean(page, path);
      } finally {
        await context.close();
      }
    });
  }
});
