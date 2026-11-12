"use client";

import { useEffect } from "react";

import { PlanWeekBoard } from "@/components/widgets/calendario/PlanWeekBoard";
import { PLAN_SECTION_ID } from "@/components/widgets/calendario/plan-week-parts";
import { emptyPlanWeek } from "@/lib/calendario/empty";
import { rangeOf } from "@/lib/calendario/range";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { CalendarioQuery } from "@/lib/types/calendario";

import { usePlanWeek } from "./use-plan-week";
import { replaceCalendarioUrl } from "./use-calendario-page";

/**
 * "Planear la semana": the collapsible section of Semana (FE §7.7). Only the
 * Semana view shows it. `?modo=planear` opens it and scrolls to it; collapsing
 * removes the param. It plans the Lun–Vie of `fecha`'s week.
 */
export function PlanWeekSection({ query }: { query: CalendarioQuery }) {
  return query.vista === "semana" ? <PlanWeekSectionBody query={query} /> : null;
}

function PlanWeekSectionBody({ query }: { query: CalendarioQuery }) {
  const weekStart = rangeOf("semana", query.fecha).from;
  const plan = usePlanWeek(weekStart);
  const viewerId = useSessionStore(selectAuthenticatedUser)?.member.id ?? null;
  const expanded = query.modo === "planear";

  useEffect(() => {
    if (expanded) document.getElementById(PLAN_SECTION_ID)?.scrollIntoView({ block: "start" });
  }, [expanded]);

  return (
    <PlanWeekBoard
      data={plan.data ?? emptyPlanWeek(weekStart)}
      proposal={plan.proposal}
      checked={plan.checked}
      busy={plan.busy}
      canUndo={plan.canUndo}
      expanded={expanded}
      viewerStaffId={viewerId}
      onExpandedChange={(next) => replaceCalendarioUrl({ ...query, modo: next ? "planear" : null })}
      onPlan={plan.plan}
      onMove={plan.move}
      onToggle={plan.toggle}
      onApply={plan.apply}
      onCancel={plan.cancel}
      onUndo={plan.undo}
    />
  );
}
