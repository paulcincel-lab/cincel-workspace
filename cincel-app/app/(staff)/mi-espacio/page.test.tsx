import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const calls = vi.hoisted(() => [] as string[]);

const redirectHelper = vi.hoisted(() => ({
  redirectIfRedesignOff: vi.fn(async (pathname: string) => {
    calls.push(`redirectIfRedesignOff:${pathname}`);
  }),
}));
vi.mock("@/lib/ui/redesign-redirect", () => redirectHelper);

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => nav);

const session = vi.hoisted(() => ({ getSessionAccess: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const gmailFlags = vi.hoisted(() => ({ fetchGmailStatusAction: true, fetchGmailThreadsAction: true }));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: gmailFlags }));

const actions = vi.hoisted(() => ({
  fetchNotificationsAction: vi.fn(),
  fetchGmailStatusAction: vi.fn(),
  fetchGmailThreadsAction: vi.fn(),
  fetchRemindersAction: vi.fn(),
  fetchChecklistsAction: vi.fn(),
  fetchNotesAction: vi.fn(),
}));
vi.mock("@/lib/actions/notifications-actions", () => ({ fetchNotificationsAction: actions.fetchNotificationsAction }));
vi.mock("@/lib/actions/gmail-actions", () => ({
  fetchGmailStatusAction: actions.fetchGmailStatusAction,
  fetchGmailThreadsAction: actions.fetchGmailThreadsAction,
}));
vi.mock("@/lib/actions/my-space-actions", () => ({
  fetchRemindersAction: actions.fetchRemindersAction,
  fetchChecklistsAction: actions.fetchChecklistsAction,
  fetchNotesAction: actions.fetchNotesAction,
}));

vi.mock("@/components/mi-espacio/MiEspacioClient", () => ({ MiEspacioClient: () => null }));

import type { MiEspacioClientProps } from "@/components/mi-espacio/MiEspacioClient";

import MiEspacioPage from "./page";

const CONNECTED = { connected: true, scopeOk: true, lastSyncedAt: null, lastError: null };
const THREAD = { id: "t1", subject: "Re: planta baja" };

async function renderPage(search: Record<string, string | string[] | undefined> = {}) {
  const element = (await MiEspacioPage({ searchParams: Promise.resolve(search) })) as ReactElement<MiEspacioClientProps>;
  return element.props;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  Object.assign(gmailFlags, { fetchGmailStatusAction: true, fetchGmailThreadsAction: true });
  session.getSessionAccess.mockResolvedValue({ user: { id: "s1" }, status: "ok" });
  actions.fetchNotificationsAction.mockResolvedValue({ items: [], nextCursor: null, unreadCount: 2 });
  actions.fetchGmailStatusAction.mockResolvedValue(CONNECTED);
  actions.fetchGmailThreadsAction.mockResolvedValue({ threads: [THREAD], nextCursor: "c2" });
  actions.fetchRemindersAction.mockResolvedValue([]);
  actions.fetchChecklistsAction.mockResolvedValue([]);
  actions.fetchNotesAction.mockResolvedValue([]);
});

describe("/mi-espacio page", () => {
  it("runs the flag-aware redirect before loading anything", async () => {
    await renderPage({ nota: "n1" });
    expect(redirectHelper.redirectIfRedesignOff).toHaveBeenCalledWith("/mi-espacio", { nota: "n1" });
    expect(calls[0]).toBe("redirectIfRedesignOff:/mi-espacio");
  });

  it("stops when the redirect helper redirects (flag off)", async () => {
    redirectHelper.redirectIfRedesignOff.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/dashboard"));
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(actions.fetchNotesAction).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to the login", async () => {
    session.getSessionAccess.mockResolvedValue({ user: null, status: "anonymous" });
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("loads notifications, Gmail, today and tomorrow's reminders, checklists and notes", async () => {
    const props = await renderPage({ nota: "n1" });
    expect(actions.fetchNotificationsAction).toHaveBeenCalledWith({});
    expect(props.notifications.unreadCount).toBe(2);
    expect(props.gmail).toEqual({ status: CONNECTED, threads: [THREAD], nextCursor: "c2" });
    const range = actions.fetchRemindersAction.mock.calls[0][0] as { from: string; to: string };
    expect(Date.parse(range.to) - Date.parse(range.from)).toBeGreaterThan(47 * 60 * 60 * 1000);
    expect(props.noteParam).toBe("n1");
  });

  it("skips the thread read when Gmail is not connected", async () => {
    const disconnected = { ...CONNECTED, connected: false };
    actions.fetchGmailStatusAction.mockResolvedValue(disconnected);
    const props = await renderPage();
    expect(actions.fetchGmailThreadsAction).not.toHaveBeenCalled();
    expect(props.gmail).toEqual({ status: disconnected, threads: [], nextCursor: null });
    expect(props.noteParam).toBeNull();
  });

  it("passes no Gmail block while the Gmail status read is a stub", async () => {
    gmailFlags.fetchGmailStatusAction = false;
    const props = await renderPage();
    expect(actions.fetchGmailStatusAction).not.toHaveBeenCalled();
    expect(props.gmail).toBeNull();
  });
});
