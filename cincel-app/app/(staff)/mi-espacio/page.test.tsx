import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_TASKS_SEED } from "@/tests/helpers/my-tasks-seed";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => nav);

const USER = { member: { id: "s1", name: "Ana" }, email: "ana@cincel.example", access: "Colaborador" };

const session = vi.hoisted(() => ({ getSessionAccess: vi.fn(), requireCapabilityUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const loader = vi.hoisted(() => ({ loadMiEspacio: vi.fn() }));
vi.mock("@/lib/loaders/mi-espacio", () => loader);

// The style the page renders (#1051): the viewer's choice, or the org default.
const appearance = vi.hoisted(() => ({ style: "esencial" as string | null }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: vi.fn(async () => ({ style: appearance.style })),
  getStoredOrgAppearance: vi.fn(async () => ({ styleDefault: "visual", allowUserOverride: true })),
}));

// The page prefetches into one request-scoped client; the test hands it a fresh one.
const server = vi.hoisted(() => ({ client: null as QueryClient | null }));
vi.mock("@/lib/query/server", () => ({ getQueryClient: () => server.client }));

// Client query functions are never called on the server; only their keys are used to seed.
vi.mock("@/lib/actions/gmail-actions", () => ({}));
vi.mock("@/lib/actions/my-space-actions", () => ({}));
vi.mock("@/lib/actions/notifications-actions", () => ({}));
vi.mock("@/lib/actions/page-data/mi-espacio-actions", () => ({}));

vi.mock("@/components/mi-espacio/MiEspacioClient", () => ({ MiEspacioClient: () => null }));

import type { MiEspacioClientProps } from "@/components/mi-espacio/MiEspacioClient";
import { qk } from "@/lib/query/keys";
import { MY_TASKS_ALL } from "@/lib/my-space/my-tasks-summary";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { MiEspacioPageData } from "@/lib/types/mi-espacio";

import MiEspacioPage from "./page";

const CONNECTED = { connected: true, scopeOk: true, lastSyncedAt: null, lastError: null };
const THREAD = {
  id: "t1",
  subject: "Re: planta baja",
  from: "Luis <luis@cliente.mx>",
  snippet: "",
  receivedAt: "2026-11-07T10:00:00.000Z",
  unread: true,
  projectId: null,
  suggestedProjectId: null,
};

const DATA: MiEspacioPageData = {
  notifications: { items: [], nextCursor: null, unreadCount: 2 },
  gmail: { status: CONNECTED, threads: [THREAD], nextCursor: "c2" },
  reminders: [],
  checklists: [],
  checklistsCursor: null,
  notes: [],
  notesCursor: "24",
  tasks: NO_TASKS_SEED,
  canCreateTask: true,
};

type HydrateElement = ReactElement<{ qc: QueryClient; children: ReactElement<MiEspacioClientProps> }>;

async function renderPage(search: Record<string, string | string[] | undefined> = {}) {
  const element = (await MiEspacioPage({ searchParams: Promise.resolve(search) })) as HydrateElement;
  return { qc: element.props.qc, client: element.props.children.props };
}

beforeEach(() => {
  vi.clearAllMocks();
  server.client = createTestQueryClient();
  session.getSessionAccess.mockResolvedValue({ user: { id: "s1" }, status: "active" });
  session.requireCapabilityUser.mockResolvedValue(USER);
  loader.loadMiEspacio.mockResolvedValue(DATA);
});

describe("/mi-espacio page", () => {
  it("sends a visitor without a session to the login", async () => {
    session.getSessionAccess.mockResolvedValue({ user: null, status: "guest" });
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(loader.loadMiEspacio).not.toHaveBeenCalled();
  });

  it("loads the page data once, as the viewer, and seeds every granular key", async () => {
    const { qc, client } = await renderPage({ nota: "n1" });
    expect(loader.loadMiEspacio).toHaveBeenCalledTimes(1);
    expect(loader.loadMiEspacio).toHaveBeenCalledWith(USER, expect.any(Date), {
      style: "esencial",
      analiticoInput: MY_TASKS_ALL,
      withClosed: false,
    });
    expect(qc).toBe(server.client);

    expect(qc.getQueryData(qk.me.notifications({}))).toEqual({ pages: [DATA.notifications], pageParams: [null] });
    expect(qc.getQueryData(qk.me.gmail.status())).toEqual(CONNECTED);
    expect(qc.getQueryData(qk.me.gmail.threads())).toEqual({
      pages: [{ threads: [THREAD], nextCursor: "c2" }],
      pageParams: [null],
    });
    expect(qc.getQueryData(qk.me.reminders("today-tomorrow"))).toEqual([]);
    expect(qc.getQueryData(qk.me.checklists())).toEqual({ pages: [{ items: [], nextCursor: null }], pageParams: [null] });
    expect(qc.getQueryData(qk.me.notes())).toEqual({ pages: [{ items: [], nextCursor: "24" }], pageParams: [null] });
    expect(qc.getQueryData(qk.me.tasksSummary(MY_TASKS_ALL))).toEqual(NO_TASKS_SEED.summary);
    expect(client.noteParam).toBe("n1");
    expect(client.canCreateTask).toBe(true);
  });

  it("Analítico narrows the task counts by the URL's filters and the closed-task switch (#1051)", async () => {
    appearance.style = "analitico";
    await renderPage({ etapa: "diseno", q: " planos ", estado: "retraso", completadas: "1" });
    expect(loader.loadMiEspacio).toHaveBeenCalledWith(USER, expect.any(Date), {
      style: "analitico",
      analiticoInput: { etapa: "diseno", q: "planos", retraso: true },
      withClosed: true,
    });
    // `?estilo=` wins over the viewer's style.
    await renderPage({ estilo: "visual", etapa: "diseno" });
    expect(loader.loadMiEspacio).toHaveBeenLastCalledWith(USER, expect.any(Date), {
      style: "visual",
      analiticoInput: { etapa: "diseno", q: null },
      withClosed: false,
    });
    appearance.style = "esencial";
  });

  it("seeds no Gmail keys while the Gmail read is a stub", async () => {
    loader.loadMiEspacio.mockResolvedValue({ ...DATA, gmail: null });
    const { qc, client } = await renderPage();
    expect(qc.getQueryData(qk.me.gmail.status())).toBeUndefined();
    expect(qc.getQueryData(qk.me.gmail.threads())).toBeUndefined();
    expect(client.noteParam).toBeNull();
  });
});
