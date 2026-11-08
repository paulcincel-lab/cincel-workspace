import { CronogramaReport } from "@/components/cronograma/cronograma-report";
import { fetchScheduleAction } from "@/lib/actions/schedule-actions";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CronogramaReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { id: projectId } = await params;
  const { asOf: asOfParam } = await searchParams;

  const view = await fetchScheduleAction(projectId);
  const asOf = view
    ? new Date(`${asOfParam && ISO_DATE.test(asOfParam) ? asOfParam : view.today}T00:00:00`)
    : null;

  // Only the report sheet prints; the shell around it (sidebar, assistant
  // button, toolbar) is hidden on paper (redesign FE §3.5).
  return (
    <>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          [data-print-root], [data-print-root] * { visibility: visible; }
          [data-print-root] { position: absolute; left: 0; top: 0; width: 100%; }
          section, [data-slot="card"] { break-inside: avoid; }
        }
      `}</style>
      {!view || !asOf ? (
        <p className="py-6 text-sm text-muted-foreground">
          Este proyecto todavía no tiene un cronograma importado, o no tienes acceso a él.
        </p>
      ) : (
        <CronogramaReport data={view.data} asOf={asOf} />
      )}
    </>
  );
}
