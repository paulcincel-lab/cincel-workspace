"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/shadcn/button";
import { fmtRange, weekBounds } from "@/lib/cronograma/week";
import { ImportDialog } from "./import-dialog";

interface CronogramaHeaderProps {
  projectId: string;
  scheduleId: string | null;
  projectName: string;
  address: string | null;
  today: Date;
  weekOffset: number;
  onImported?: () => void;
  readOnly?: boolean;
}

/** Project title, week navigation, and the actions menu (Exportar / Importar / Generar reporte). Exportar and Generar reporte are wired in Phase 4. */
export function CronogramaHeader({
  projectId,
  scheduleId,
  projectName,
  address,
  today,
  weekOffset,
  onImported,
  readOnly = false,
}: CronogramaHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setOffset(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 0) params.delete("week");
    else params.set("week", String(next));
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }

  const { start, end } = weekBounds(today, weekOffset);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{projectName}</h1>
        {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOffset(weekOffset - 1)}>
            ←
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(weekOffset + 1)}>
            →
          </Button>
        </div>
        {readOnly ? null : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/api/proyectos/${projectId}/cronograma/export`} download={`cronograma-${projectId}.json`} />}
            >
              Exportar
            </Button>
            <ImportDialog projectId={projectId} scheduleId={scheduleId} onImported={onImported} />
            <Button variant="outline" size="sm" render={<Link href={`/proyectos/${projectId}/cronograma/reporte`} />}>
              Generar reporte
            </Button>
          </div>
        )}
        <div className="text-right text-sm">
          <div className="font-medium text-foreground">{fmtRange(start, end)}</div>
          <div className="text-xs text-muted-foreground">
            {weekOffset === 0 ? "semana actual" : `${weekOffset > 0 ? "+" : ""}${weekOffset} semana(s) desde hoy`}
          </div>
        </div>
      </div>
    </div>
  );
}
