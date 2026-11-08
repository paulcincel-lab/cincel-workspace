"use client";

import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/PageHeader";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import { myVacationsOptions, vacationAbsencesOptions } from "@/lib/query/options/biblioteca";

import { TeamAbsencesStrip } from "./TeamAbsencesStrip";
import { VacationDocuments } from "./VacationDocuments";
import { VacationForm } from "./VacationForm";
import { VacationHistory } from "./VacationHistory";
import { balanceKpis } from "./vacation-format";

export type MisVacacionesClientProps = {
  /** "YYYY-MM" of the team strip. */
  month: string;
  /** Year of the balance, for the description. */
  year: number;
};

/**
 * Mis vacaciones (redesign FE §3.7): balance (`KpiWidget`), "Nueva solicitud"
 * (`VacationForm`), history with cancel (`VacationHistory`), who is away this
 * month (`TeamAbsencesStrip`) and the old section's documents. Composes only
 * library widgets and patterns; the style switch re-renders them in place.
 * Reads `me.vacations` and `vacations.absences(month)` (seeded by the page);
 * the request and cancel mutations update those queries, so nothing reloads
 * by hand. A null query (its read still a stub) hides its section; write
 * entry points stay hidden while their `IMPLEMENTED` flag is false.
 */
export function MisVacacionesClient({ month, year }: MisVacacionesClientProps) {
  const mine = useQuery(myVacationsOptions(month)).data ?? null;
  const absences = useQuery(vacationAbsencesOptions(month)).data ?? null;

  const canRequest = mine !== null && IMPLEMENTED.requestVacationAction;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mis vacaciones"
        description={`Saldo ${year}, solicitudes y quién está fuera este mes.`}
        breadcrumb={[{ label: "Biblioteca", href: "/biblioteca" }, { label: "Mis vacaciones" }]}
        actions={
          <>
            {canRequest && mine ? <VacationForm balance={mine.balance} /> : null}
            <EstiloSwitch />
          </>
        }
      />
      {mine ? (
        <section aria-label={`Saldo ${year}`}>
          <KpiWidget items={balanceKpis(mine.balance)} />
        </section>
      ) : null}
      {mine ? <VacationHistory requests={mine.requests} /> : null}
      {absences ? <TeamAbsencesStrip month={month} absences={absences} /> : null}
      <VacationDocuments />
    </div>
  );
}
