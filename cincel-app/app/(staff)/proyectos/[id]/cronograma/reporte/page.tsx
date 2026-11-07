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
          asOf={new Date(`${asOfParam && ISO_DATE.test(asOfParam) ? asOfParam : view.today}T00:00:00`)}
        />
      )}
    </main>
  );
}
