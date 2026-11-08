/**
 * E2E: the assistant sheet on staff pages (redesign R7-11, FE §3.9, §17): ⌘J opens it on Inicio, and a
 * write tool asks for confirmation; "Confirmar" sends the approval and the result shows "Hecho".
 *
 * The chat route is answered by a fixture UI message stream (`page.route`), so no LLM credentials are needed:
 * the first request gets an approval request for `create_note`, the next one
 * (carrying `approvals`) gets the tool result.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
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

test.describe("Asistente · sheet", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("Inicio: opens with ⌘J and a confirmed write runs the tool", async ({ page }) => {
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
});
