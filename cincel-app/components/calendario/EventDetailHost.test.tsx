// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { CalTaskItem } from "@/lib/types/calendario";
import type { PresentationStyle } from "@/lib/types/redesign";

const detail = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./use-calendario-detail", () => ({ useCalendarioDetail: () => detail.value }));

import { EventDetailHost } from "./EventDetailHost";

const item = {
  kind: "task", id: "t:1", taskId: "1", title: "Ingenierías", date: "2026-11-13", dateField: "commitmentDate",
  project: null, etapa: null, phase: null, status: "pendiente", statusLabel: "Pendiente", priority: "alta", manager: null,
  support: [], overdue: false, completed: false, blocked: false, hours: 1, hoursSource: "default", parentTaskId: null, canEdit: true,
} as CalTaskItem;

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(cleanup);

function renderHost(style: PresentationStyle) {
  return render(
    <StyleProvider style={style} scope="staff">
      <EventDetailHost />
    </StyleProvider>,
  );
}

describe("EventDetailHost", () => {
  it("renders nothing without an open ?evento=", () => {
    detail.value = null;
    renderHost("visual");
    expect(screen.queryByText("Ingenierías")).toBeNull();
  });

  it.each([
    ["visual", "event-detail-card"],
    ["esencial", "event-detail-sheet"],
    ["analitico", "event-detail-drawer"],
  ] as const)("mounts the %s detail", (style, slot) => {
    detail.value = { id: "t:1", kind: "task", entityId: "1", item, isPending: false, actions: [], close: vi.fn() };
    renderHost(style);
    expect(document.querySelector(`[data-slot="${slot}"]`) ?? screen.queryByText("Ingenierías")).toBeTruthy();
    expect(screen.getAllByText("Ingenierías").length).toBeGreaterThan(0);
  });
});
