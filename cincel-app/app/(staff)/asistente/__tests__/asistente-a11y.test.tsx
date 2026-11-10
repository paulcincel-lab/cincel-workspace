// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup } from "@testing-library/react";
import axe from "axe-core";
import type { UIMessage } from "ai";

import { THEME_IDS } from "@/lib/ui/themes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/actions/assistant-actions", () => ({
  fetchAssistantThreadsAction: vi.fn(async () => []),
  deleteAssistantThreadAction: vi.fn(async () => ({ ok: true, data: undefined })),
  pinAssistantThreadAction: vi.fn(),
  markAssistantThreadReadAction: vi.fn(async () => undefined),
  importLegacyAssistantThreadAction: vi.fn(async () => ({ id: "t-legacy" })),
  fetchAssistantActionsAction: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/page-data/asistente-actions", () => ({
  fetchAssistantThreadAction: vi.fn(async () => null),
  lookupAssistantContextAction: vi.fn(async () => null),
  getAsistentePageData: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => []),
  fetchCatalogAssignableStaff: vi.fn(async () => []),
  fetchCatalogContacts: vi.fn(async () => []),
  fetchCatalogProjectSpaces: vi.fn(async () => []),
  fetchCatalogStaff: vi.fn(async () => []),
  fetchCatalogTaskStatuses: vi.fn(async () => []),
  fetchCatalogWorkflows: vi.fn(async () => []),
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: { messages?: UIMessage[] }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [messages, setMessages] = useState<UIMessage[]>(opts.messages ?? []);
    return { messages, setMessages, sendMessage: vi.fn(), status: "ready", addToolApprovalResponse: vi.fn() };
  },
}));

import { AsistentePageClient } from "@/components/asistente/AsistentePageClient";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { AssistantThreadSummary } from "@/lib/types/redesign";

const now = Date.now();
const STATUS = { pinnedAt: null, pendingApprovals: 0, unread: false, toolCalls: 0 };
const THREADS: AssistantThreadSummary[] = [
  { ...STATUS, id: "t1", title: "Avance de Local Espinopapa", updatedAt: new Date(now - 60_000).toISOString() },
  {
    ...STATUS,
    id: "t2",
    title: "Cuantificar porcelanato 60×60",
    updatedAt: new Date(now - 3 * 86_400_000).toISOString(),
    pinnedAt: new Date(now - 86_400_000).toISOString(),
    pendingApprovals: 1,
  },
  {
    ...STATUS,
    id: "t3",
    title: "Cronograma remodelación Ensenada",
    updatedAt: new Date(now - 40 * 86_400_000).toISOString(),
    unread: true,
  },
];

function seeded(threads: AssistantThreadSummary[], thread?: { id: string }) {
  const client = createTestQueryClient();
  client.setQueryData(qk.asistente.threads(), threads);
  if (thread) client.setQueryData(qk.asistente.thread(thread.id), thread);
  return client;
}

const THREAD = {
  id: "t1",
  title: "Avance de Local Espinopapa",
  messages: [
    { id: "m1", role: "user", parts: [{ type: "text", text: "¿Cómo va Local Espinopapa?" }] },
    { id: "m2", role: "assistant", parts: [{ type: "text", text: "Va en **82%** y en fase de Construcción." }] },
  ] as UIMessage[],
};

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide; token pairs are covered by lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function applyTheme(theme: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", theme);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

describe("/asistente accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = renderWithQueryClient(<AsistentePageClient threadId={THREAD.id} />, {
          client: seeded(THREADS, THREAD),
        });
        await act(async () => {});
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("has no serious or critical axe violations with an empty history and a missing thread", async () => {
    applyTheme("azul", "light");
    const { container } = renderWithQueryClient(<AsistentePageClient threadId={null} missingThread />, {
      client: seeded([]),
    });
    await act(async () => {});
    expect(await seriousViolations(container)).toEqual([]);
  });
});
