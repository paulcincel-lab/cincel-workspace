"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { ResumenPanel } from "@/components/widgets/calendario/ResumenPanel";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { runProposingToolAction } from "@/lib/actions/calendario-actions";
import { rangeOf } from "@/lib/calendario/range";
import { useActionMutation } from "@/lib/query/mutation";
import { calendarioDaySummaryOptions, calendarioWeekSummaryOptions } from "@/lib/query/options/calendario";
import { openAssistant } from "@/lib/stores/assistant-ui-store";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import { addDays } from "@/lib/time-tracking/local-time";
import type { CalendarioQuery, SummaryAction } from "@/lib/types/calendario";

import { replaceCalendarioUrl } from "./use-calendario-page";
import { useProposal } from "./use-proposal";

/**
 * Resumen del día / semana at the top of Día and Semana (FE §7.3). On a narrow screen it starts
 * collapsed to its greeting line so the Barra para pedir stays first (F9). Its actions only ask for
 * proposals or open the asistente; nothing is written here.
 */
export function ResumenSection({ query }: { query: CalendarioQuery }) {
  if (query.vista === "mes") return null;
  return query.vista === "dia" ? <DayResumen query={query} /> : <WeekResumen query={query} />;
}

function useCollapseOnMobile() {
  const setCollapsed = useCalendarioUi((s) => s.setResumenCollapsed);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) setCollapsed(true);
  }, [setCollapsed]);
}

function useSummaryActions(query: CalendarioQuery) {
  const proposal = useProposal();
  const ask = useActionMutation((vars: { name: "move_tasks" | "resolve_overlap" | "propose_redistribution"; input: unknown }) => runProposingToolAction(vars.name, vars.input), {
    errorContext: "calendario",
    setData: (_qc, p) => proposal.open(p),
  });
  return (action: SummaryAction) => {
    switch (action.kind) {
      case "prepare":
        replaceCalendarioUrl({ ...query, evento: `e:${action.eventId}` });
        return;
      case "defer":
        ask.mutate({ name: "move_tasks", input: { taskIds: [action.taskId], toDate: addDays(query.fecha, 1) } });
        return;
      case "resolve":
        ask.mutate({ name: "resolve_overlap", input: { eventIds: action.eventIds } });
        return;
      case "redistribute":
        ask.mutate({ name: "propose_redistribution", input: { date: action.date, target: "spread" } });
        return;
      case "propose_date":
      case "assign":
      case "notify":
        openAssistant({ prompt: `${action.label}: tarea ${action.taskId}` });
        return;
    }
  };
}

function DayResumen({ query }: { query: CalendarioQuery }) {
  useCollapseOnMobile();
  const { data } = useQuery(calendarioDaySummaryOptions(query.fecha));
  const onAction = useSummaryActions(query);
  if (!data) return null;
  return <PageStyleLayout visual={() => <ResumenPanel summary={data} variant="visual" onAction={onAction} />} esencial={() => <ResumenPanel summary={data} variant="esencial" onAction={onAction} />} analitico={() => <ResumenPanel summary={data} variant="analitico" onAction={onAction} />} />;
}

function WeekResumen({ query }: { query: CalendarioQuery }) {
  useCollapseOnMobile();
  const from = rangeOf("semana", query.fecha).from;
  const { data } = useQuery(calendarioWeekSummaryOptions(from));
  const onAction = useSummaryActions(query);
  if (!data) return null;
  const onPlanWeek = () => replaceCalendarioUrl({ ...query, modo: "planear" });
  return <PageStyleLayout visual={() => <ResumenPanel summary={data} variant="visual" onAction={onAction} onPlanWeek={onPlanWeek} />} esencial={() => <ResumenPanel summary={data} variant="esencial" onAction={onAction} onPlanWeek={onPlanWeek} />} analitico={() => <ResumenPanel summary={data} variant="analitico" onAction={onAction} onPlanWeek={onPlanWeek} />} />;
}
