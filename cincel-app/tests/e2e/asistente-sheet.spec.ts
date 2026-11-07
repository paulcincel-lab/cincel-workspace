/**
 * E2E: the assistant sheet on staff pages (redesign R7-11, FE §3.9, §17).
 *
 * Runs with the redesign flag on for the admin. The chat route is answered by
 * a fixture UI message stream (`page.route`), so no LLM credentials are needed:
 * the first request gets an approval request for `create_note`, the next one
 * (carrying `approvals`) gets the tool result.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const COMPOSER = "Pregunta, pide un cálculo o arrastra un plano…";

function sse(chunks: object[]): string {
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

const APPROVAL_REQUEST = sse([
  { type: "start", messageId: "a1" },
  { type: "start-step" },
  { type: "tool-input-available", toolCallId: "call-1", toolName: "create_note", input: { title: "Compras de obra" } },
  { type: "tool-approval-request", approvalId: "ap-1", toolCallId: "call-1" },
  { type: "finish-step" },
  { type: "finish" },
]);

const TOOL_RESULT = sse([
  { type: "start" },
  { type: "start-step" },
  { type: "tool-output-available", toolCallId: "call-1", output: { id: "n1" } },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "Creé la nota." },
  { type: "text-end", id: "t" },
  { type: "finish-step" },
  { type: "finish" },
]);

/** Answers the chat route with fixtures and records every request body. */
async function stubChatRoute(page: Page): Promise<Record<string, unknown>[]> {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/asistente/chat", async (route) => {
    const body = JSON.parse((route.request() as Request).postData() ?? "{}") as Record<string, unknown>;
    bodies.push(body);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      body: Array.isArray(body.approvals) ? TOOL_RESULT : APPROVAL_REQUEST,
    });
  });
  return bodies;
}

/** Turns the redesign on for the signed-in user through the legacy opt-in banner (FE §2.3). */
async function enableRedesign(page: Page) {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  if (/\/inicio/.test(page.url())) return;
  await page.getByRole("button", { name: "Activar" }).click();
  await page.waitForURL(/\/inicio/, { timeout: 20_000 });
}

async function openSheet(page: Page) {
  await page.getByRole("button", { name: /Pregúntale a Cincel/ }).click();
  await expect(page.getByPlaceholder(COMPOSER)).toBeVisible();
}

test.describe("Asistente · sheet", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await enableRedesign(page);
  });

  test("Inicio: opens with ⌘J, no entity chip, confirmation card flow", async ({ page }) => {
    const bodies = await stubChatRoute(page);
    await page.goto(`${BASE_URL}/inicio`, { waitUntil: "load" });

    const trigger = page.getByRole("button", { name: /Pregúntale a Cincel/ });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("ControlOrMeta+j");
    await expect(page.getByPlaceholder(COMPOSER)).toBeVisible();
    await expect(page.getByText(/^Viendo:/)).toHaveCount(0);

    await page.getByPlaceholder(COMPOSER).fill("Crea una nota de compras");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Crear la nota “Compras de obra”")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Hecho")).toBeVisible();
    await expect(page.getByText("Creé la nota.")).toBeVisible();

    expect(bodies).toHaveLength(2);
    expect(bodies[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[0]).not.toHaveProperty("messages");
    expect(bodies[0].context).toEqual({ route: "/inicio" });
    expect(bodies[1].id).toBe(bodies[0].id);
    expect(bodies[1].approvals).toEqual([{ toolCallId: "call-1", approved: true }]);

    const fullscreen = page.getByRole("link", { name: "Pantalla completa" });
    await expect(fullscreen).toHaveAttribute("href", `/asistente?thread=${bodies[0].id}`);

    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder(COMPOSER)).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Proyecto: the chip names the project the server confirms", async ({ page }) => {
    const bodies = await stubChatRoute(page);
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "load" });
    const projectLink = page.locator('a[href^="/proyectos/"]').first();
    const href = (await projectLink.getAttribute("href")) ?? "";
    const projectId = href.split("/")[2];
    const projectName = (await projectLink.innerText()).split("\n")[0].trim();
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "load" });

    await openSheet(page);
    await expect(page.getByText(/^Viendo:/)).toContainText(projectName);

    await page.getByPlaceholder(COMPOSER).fill("Resume este proyecto");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("button", { name: "Confirmar" })).toBeVisible();
    expect(bodies[0].context).toMatchObject({ route: `/proyectos/${projectId}`, projectId });
  });

  test("Proyecto desconocido: no chip for an id the server doesn't confirm", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/00000000-0000-4000-8000-000000000000`, { waitUntil: "load" });
    const trigger = page.getByRole("button", { name: /Pregúntale a Cincel/ });
    test.skip((await trigger.count()) === 0, "The not-found page renders outside the staff shell.");
    await openSheet(page);
    await page.waitForTimeout(1_000);
    await expect(page.getByText(/^Viendo:/)).toHaveCount(0);
  });

  test("Tareas: /tareas?tarea=<id> sends taskId and Cancelar shows Cancelado", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/asistente/chat", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      bodies.push(body);
      const denied = sse([
        { type: "start" },
        { type: "start-step" },
        { type: "tool-output-denied", toolCallId: "call-1" },
        { type: "finish-step" },
        { type: "finish" },
      ]);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
        body: Array.isArray(body.approvals) ? denied : APPROVAL_REQUEST,
      });
    });

    await page.goto(`${BASE_URL}/tareas`, { waitUntil: "load" });
    const taskLink = page.locator('a[href*="tarea="]').first();
    const href = (await taskLink.getAttribute("href")) ?? "";
    const taskId = new URL(href, BASE_URL).searchParams.get("tarea") ?? "";
    await page.goto(`${BASE_URL}/tareas?tarea=${taskId}`, { waitUntil: "load" });

    await openSheet(page);
    await expect(page.getByText(/^Viendo:/)).toBeVisible();
    await page.getByPlaceholder(COMPOSER).fill("Crea una nota de esta tarea");
    await page.getByRole("button", { name: "Enviar" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Cancelado")).toBeVisible();

    expect(bodies[0].context).toMatchObject({ route: "/tareas", taskId });
    expect(bodies[1].approvals).toEqual([{ toolCallId: "call-1", approved: false }]);
  });

  test("the button is not on /asistente", async ({ page }) => {
    await page.goto(`${BASE_URL}/asistente`, { waitUntil: "load" });
    await expect(page.getByRole("button", { name: /Pregúntale a Cincel/ })).toHaveCount(0);
  });
});
