"use client";

import { useCallback, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { fetchMyVacationsAction, fetchTeamAbsencesAction } from "@/lib/actions/vacations-actions";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import type { TeamAbsence, VacationBalance, VacationRequest } from "@/lib/types/redesign";

import { TeamAbsencesStrip } from "./TeamAbsencesStrip";
import { VacationDocuments, type VacationDocument } from "./VacationDocuments";
import { VacationForm } from "./VacationForm";
import { VacationHistory } from "./VacationHistory";
import { balanceKpis } from "./vacation-format";

export type MyVacations = { balance: VacationBalance; requests: VacationRequest[] };

export type MisVacacionesClientProps = {
  /** Null while `fetchMyVacationsAction` is a stub (balance and history hidden). */
  mine: MyVacations | null;
  /** "YYYY-MM" of the team strip. */
  month: string;
  /** Null while `fetchTeamAbsencesAction` is a stub (strip hidden). */
  absences: TeamAbsence[] | null;
  documents: VacationDocument[];
  /** Year of the balance, for the description. */
  year: number;
};

/**
 * Mis vacaciones (redesign FE §3.7): balance (`KpiWidget`), "Nueva solicitud"
 * (`VacationForm`), history with cancel (`VacationHistory`), who is away this
 * month (`TeamAbsencesStrip`) and the old section's documents. Composes only
 * library widgets and patterns; the style switch re-renders them in place.
 * After a request or a cancel it reloads the balance and the team strip from
 * the server. Entry points to write actions stay hidden while their
 * `IMPLEMENTED` flag is false.
 */
export function MisVacacionesClient({ mine: initialMine, month, absences: initialAbsences, documents, year }: MisVacacionesClientProps) {
  const [mine, setMine] = useState<MyVacations | null>(initialMine);
  const [absences, setAbsences] = useState<TeamAbsence[] | null>(initialAbsences);

  const reload = useCallback(
    async (fallback: (current: MyVacations) => MyVacations) => {
      try {
        setMine(await fetchMyVacationsAction());
      } catch {
        setMine((current) => (current ? fallback(current) : current));
      }
      if (initialAbsences !== null) {
        try {
          setAbsences(await fetchTeamAbsencesAction({ month }));
        } catch {
          // Keep the strip as it was; the next page load refreshes it.
        }
      }
    },
    [initialAbsences, month],
  );

  const onSubmitted = useCallback(
    (created: VacationRequest) =>
      reload((current) => ({ ...current, requests: [created, ...current.requests.filter((r) => r.id !== created.id)] })),
    [reload],
  );

  const onCancelled = useCallback(
    (id: string) =>
      reload((current) => ({
        ...current,
        requests: current.requests.map((r) => (r.id === id ? { ...r, status: "cancelada" as const } : r)),
      })),
    [reload],
  );

  const canRequest = mine !== null && IMPLEMENTED.requestVacationAction;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mis vacaciones"
        description={`Saldo ${year}, solicitudes y quién está fuera este mes.`}
        breadcrumb={[{ label: "Biblioteca", href: "/biblioteca" }, { label: "Mis vacaciones" }]}
        actions={
          <>
            {canRequest && mine ? <VacationForm balance={mine.balance} onSubmitted={onSubmitted} /> : null}
            <EstiloSwitch />
          </>
        }
      />
      {mine ? (
        <section aria-label={`Saldo ${year}`}>
          <KpiWidget items={balanceKpis(mine.balance)} />
        </section>
      ) : null}
      {mine ? <VacationHistory requests={mine.requests} onCancelled={onCancelled} /> : null}
      {absences ? <TeamAbsencesStrip month={month} absences={absences} /> : null}
      <VacationDocuments documents={documents} />
    </div>
  );
}
