import { CronogramaReport } from "@/components/cronograma/cronograma-report";
import { fetchScheduleAction } from "@/lib/actions/schedule-actions";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

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

  const appearance = await getResolvedAppearance();
  if (appearance.redesignEnabled) {
    // New shell (redesign FE §3.5): only the report sheet prints; the shell
    // around it (sidebar, assistant button, toolbar) is hidden on paper.
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
          <CronogramaReport data={view.data} asOf={asOf} layout="sheet" />
        )}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          section, [data-slot="card"] { break-inside: avoid; }
        }
      `}</style>
      {!view ? (
        <p className="p-6 text-sm text-muted-foreground">
          Este proyecto todavía no tiene un cronograma importado, o no tienes acceso a él.
        </p>
      ) : (
        <CronogramaReport
          data={view.data}
          asOf={asOf ?? new Date(`${view.today}T00:00:00`)}
        />
      )}
    </main>
  );
}
