import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { emptyCalendarioRange, emptyDaySummary, emptyPlanWeek, emptyWeekSummary } from "@/lib/calendario/empty";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { parseCalendarioQuery } from "@/lib/calendario/url-state";
import type { CalTaskItem, Proposal } from "@/lib/types/calendario";

vi.mock("@/components/calendario/use-calendario-assistant-context", () => ({ useOpenCalendarioAssistant: () => vi.fn(), useCalendarioAssistantContext: () => ({ view: "semana", from: "2026-11-09", to: "2026-11-15" }) }));

import { BarraParaPedir } from "./BarraParaPedir";
import { CalendarItemChip } from "./CalendarItemChip";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { CalendarWeekColumns } from "./CalendarWeekColumns";
import { CalendarioEsencial } from "./CalendarioEsencial";
import { CalendarioVisual } from "./CalendarioVisual";
import { DayAlertBanner } from "./DayAlertBanner";
import { DayLoadMeter } from "./DayLoadMeter";
import { MeetingPrepPanel } from "./MeetingPrepPanel";
import { MeetingsList } from "./MeetingsList";
import { PlanWeekBoard } from "./PlanWeekBoard";
import { ProposalCard } from "./ProposalCard";
import { ProposalOverlay } from "./ProposalOverlay";
import { ProposalTable } from "./ProposalTable";
import { ResumenPanel } from "./ResumenPanel";

const task: CalTaskItem = {
  kind: "task",
  id: "t:1",
  taskId: "1",
  title: "Ingenierías",
  date: "2026-11-11",
  dateField: "commitmentDate",
  project: null,
  etapa: null,
  phase: null,
  status: "pendiente",
  statusLabel: "Pendiente",
  priority: "media",
  manager: null,
  support: [],
  overdue: false,
  completed: false,
  blocked: false,
  hours: 1,
  hoursSource: "default",
  parentTaskId: null,
  canEdit: true,
};
const range = { ...emptyCalendarioRange({ from: "2026-11-09", to: "2026-11-15" }, "2026-11-11"), items: [task] };
const query = parseCalendarioQuery("", { today: "2026-11-11" });
const proposal: Proposal = {
  id: "p1",
  kind: "mover_tareas",
  status: "propuesta",
  title: "Mover 3 tareas",
  line: "Al jueves",
  rangeFrom: null,
  rangeTo: null,
  changes: [],
  deferred: [],
  createdAt: "2026-11-11T10:00:00Z",
  expiresAt: "2026-11-12T10:00:00Z",
};

describe("Calendario widget stubs", () => {
  it.each([
    ["Calendario visual", <CalendarioVisual key="v" range={range} query={query} />],
    ["Calendario esencial", <CalendarioEsencial key="e" range={range} query={query} />],
    ["Mes", <CalendarMonthGrid key="m" range={range} query={query} />],
    ["Semana", <CalendarWeekColumns key="w" range={range} query={query} />],
  ])("%s renders a labelled section with the item titles", (_name, node) => {
    const qc = new QueryClient();
    const { container } = render(node, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
    const section = container.querySelector("section");
    expect(section?.getAttribute("aria-label")).toBeTruthy();
    expect(screen.getByText("Ingenierías")).toBeTruthy();
  });

  it("renders the rest without throwing", () => {
    const { container } = render(
      <>
        <CalendarItemChip item={task} density="chip" />
        <ProposalOverlay proposal={proposal} checked={[]} />
        <ProposalCard proposal={proposal} checked={[]} />
        <ProposalTable proposal={proposal} checked={[]} />
        <QueryClientProvider client={createTestQueryClient()}>
          <BarraParaPedir
            context={{ view: "semana", from: "2026-11-09", to: "2026-11-15", filters: { mostrar: "todo", quien: "yo", proyectos: [], ocultarCompletadas: false } }}
            examples={["Pasa lo vencido al jueves"]}
          />
        </QueryClientProvider>
        <ResumenPanel summary={emptyDaySummary("2026-11-11")} />
        <ResumenPanel summary={emptyWeekSummary("2026-11-09")} />
        <DayLoadMeter hours={2} workday={6} label="bien" />
        <DayAlertBanner kind="overload" date="2026-11-12" />
        <MeetingPrepPanel prep={null} eventId="e1" />
        <MeetingsList meetings={[]} />
        <PlanWeekBoard data={emptyPlanWeek("2026-11-16")} />
      </>,
    );
    expect(container.querySelectorAll("section").length).toBeGreaterThan(5);
  });
});
