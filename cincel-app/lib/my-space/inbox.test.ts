import { describe, expect, it } from "vitest";

import {
  formatInboxTime,
  gmailSenderName,
  gmailSyncLabel,
  inboxCounts,
  inboxRows,
  inboxTabSearch,
  mergeNotifications,
  parseInboxTab,
} from "./inbox";
import type { GmailThreadSummary, NotificationItem } from "@/lib/types/redesign";

function n(id: string, over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    kind: "asignacion",
    title: id,
    body: "",
    entity: null,
    entityId: null,
    url: null,
    readAt: null,
    createdAt: "2026-11-06T10:00:00.000Z",
    ...over,
  };
}

function t(id: string, over: Partial<GmailThreadSummary> = {}): GmailThreadSummary {
  return {
    id,
    subject: id,
    from: "a@b.mx",
    snippet: "",
    receivedAt: "2026-11-06T10:00:00.000Z",
    unread: true,
    projectId: null,
    suggestedProjectId: null,
    ...over,
  };
}

describe("Bandeja tabs", () => {
  it("parses the tab param and falls back to todo", () => {
    expect(parseInboxTab("menciones")).toBe("menciones");
    expect(parseInboxTab(["gmail"])).toBe("gmail");
    expect(parseInboxTab("otra")).toBe("todo");
    expect(parseInboxTab(undefined)).toBe("todo");
  });

  it("builds the tab query keeping other params", () => {
    expect(inboxTabSearch("estilo=analitico", "gmail")).toBe("?estilo=analitico&bandeja=gmail");
    expect(inboxTabSearch("bandeja=gmail", "todo")).toBe("");
  });
});

describe("Bandeja rows and counts", () => {
  const items = [
    n("a", { createdAt: "2026-11-06T10:00:00.000Z" }),
    n("m", { kind: "mencion", createdAt: "2026-11-06T12:00:00.000Z" }),
    n("r", { readAt: "2026-11-06T13:00:00.000Z", createdAt: "2026-11-06T09:00:00.000Z" }),
  ];
  const threads = [t("g1", { receivedAt: "2026-11-06T11:00:00.000Z" }), t("g2", { unread: false })];

  it("merges sources newest first and filters per tab", () => {
    expect(inboxRows("todo", items, threads).map((r) => r.key)).toEqual(["n:m", "g:g1", "n:a", "g:g2", "n:r"]);
    expect(inboxRows("gmail", items, threads).map((r) => r.key)).toEqual(["g:g1", "g:g2"]);
    expect(inboxRows("notificaciones", items, threads).map((r) => r.key)).toEqual(["n:m", "n:a", "n:r"]);
    expect(inboxRows("menciones", items, threads).map((r) => r.key)).toEqual(["n:m"]);
  });

  it("counts unread per tab", () => {
    expect(inboxCounts({ notifications: items, unreadCount: 2, threads })).toEqual({
      todo: 3,
      gmail: 1,
      notificaciones: 2,
      menciones: 1,
    });
  });

  it("merges a polled page over the loaded rows", () => {
    const merged = mergeNotifications(items, [n("a", { readAt: "2026-11-06T14:00:00.000Z" }), n("z", { createdAt: "2026-11-06T15:00:00.000Z" })]);
    expect(merged.map((x) => x.id)).toEqual(["z", "m", "a", "r"]);
    expect(merged.find((x) => x.id === "a")?.readAt).not.toBeNull();
  });
});

describe("Bandeja labels", () => {
  it("formats times in lowercase es-MX", () => {
    const now = new Date(2026, 10, 6, 15, 0);
    expect(formatInboxTime(new Date(2026, 10, 6, 9, 2).toISOString(), now)).toBe("9:02");
    expect(formatInboxTime(new Date(2026, 10, 5, 9, 2).toISOString(), now)).toBe("ayer");
    expect(formatInboxTime(new Date(2026, 9, 28, 9, 2).toISOString(), now)).toBe("28 oct");
  });

  it("names the sender without the address", () => {
    expect(gmailSenderName("Juanma Ruiz <juanma@x.mx>")).toBe("Juanma Ruiz");
    expect(gmailSenderName('"Ana" <ana@x.mx>')).toBe("Ana");
    expect(gmailSenderName("conta@x.mx")).toBe("conta@x.mx");
  });

  it("describes the last Gmail sync", () => {
    const now = new Date("2026-11-06T12:00:00.000Z");
    expect(gmailSyncLabel("2026-11-06T11:55:00.000Z", now)).toBe("Gmail conectado · sincronizado hace 5 min");
    expect(gmailSyncLabel("2026-11-06T09:00:00.000Z", now)).toBe("Gmail conectado · sincronizado hace 3 h");
    expect(gmailSyncLabel(null, now)).toBe("Gmail conectado");
  });
});
