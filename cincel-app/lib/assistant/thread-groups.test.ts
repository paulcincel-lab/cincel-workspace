import { describe, expect, it } from "vitest";

import {
  filterAssistantThreads,
  groupAssistantThreads,
  threadStatusLine,
  threadTimeLabel,
} from "@/lib/assistant/thread-groups";
import type { AssistantThreadSummary } from "@/lib/types/redesign";

// Thursday 5 Nov 2026, noon local time.
const NOW = new Date(2026, 10, 5, 12, 0, 0);

function at(month: number, day: number, hour = 10, minute = 0): string {
  return new Date(2026, month, day, hour, minute).toISOString();
}

function thread(id: string, patch: Partial<AssistantThreadSummary> = {}): AssistantThreadSummary {
  return { id, title: id, updatedAt: at(10, 5), pinnedAt: null, pendingApprovals: 0, unread: false, ...patch };
}

describe("groupAssistantThreads (pinned mode)", () => {
  it("pinned threads first, newest pin first", () => {
    const threads = [
      thread("reciente-viejo", { updatedAt: at(9, 20) }),
      thread("fijada-vieja", { updatedAt: at(10, 5, 11), pinnedAt: at(10, 1) }),
      thread("reciente-nuevo", { updatedAt: at(10, 5, 9) }),
      thread("fijada-nueva", { updatedAt: at(9, 1), pinnedAt: at(10, 4) }),
    ];

    const groups = groupAssistantThreads(threads, NOW, "pinned");

    expect(groups.map((g) => [g.label, g.threads.map((t) => t.id)])).toEqual([
      ["Fijadas", ["fijada-nueva", "fijada-vieja"]],
      ["Recientes", ["reciente-nuevo", "reciente-viejo"]],
    ]);
  });

  it("leaves Fijadas out when nothing is pinned", () => {
    const groups = groupAssistantThreads([thread("a"), thread("b")], NOW, "pinned");
    expect(groups.map((g) => g.key)).toEqual(["recientes"]);
  });

  it("keeps the date groups by default", () => {
    const groups = groupAssistantThreads([thread("hoy"), thread("antes", { updatedAt: at(9, 1) })], NOW);
    expect(groups.map((g) => g.label)).toEqual(["Hoy", "Anteriores"]);
  });
});

describe("filterAssistantThreads", () => {
  const threads = [
    thread("1", { title: "Revisión de Diseño en Oficina Polanco" }),
    thread("2", { title: "Cotización cancelería" }),
    thread("3", { title: "Ampliación Ñuñoa" }),
  ];

  it("search ignores case and accents", () => {
    expect(filterAssistantThreads(threads, "DISENO").map((t) => t.id)).toEqual(["1"]);
    expect(filterAssistantThreads(threads, "cotizacion").map((t) => t.id)).toEqual(["2"]);
    expect(filterAssistantThreads(threads, "nunoa").map((t) => t.id)).toEqual(["3"]);
    expect(filterAssistantThreads(threads, "  ").map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(filterAssistantThreads(threads, "nada")).toEqual([]);
  });
});

describe("threadStatusLine", () => {
  it("pending confirmation wins, then new reply, then the time", () => {
    expect(threadStatusLine(thread("p", { pendingApprovals: 1, unread: true, updatedAt: at(10, 5, 10, 42) }), NOW)).toEqual({
      tone: "warning",
      text: "Confirmación pendiente · 10:42",
      emphasis: true,
    });
    expect(threadStatusLine(thread("u", { unread: true, updatedAt: at(10, 5, 9, 15) }), NOW)).toEqual({
      tone: "muted",
      text: "Nueva respuesta · 09:15",
      emphasis: true,
    });
    expect(threadStatusLine(thread("t", { updatedAt: at(9, 28) }), NOW).text).toBe("28 oct");
  });

  it("rail time labels: time today, weekday and date this week, date before", () => {
    expect(threadTimeLabel(at(10, 5, 8, 30), "recientes", NOW)).toBe("08:30");
    expect(threadTimeLabel(at(10, 3), "recientes", NOW)).toBe("mar 3 nov");
    expect(threadTimeLabel(at(9, 28), "fijadas", NOW)).toBe("28 oct");
  });
});
