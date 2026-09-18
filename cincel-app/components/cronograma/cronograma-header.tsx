"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/shadcn/button";
import { fmtRange, weekBounds } from "@/lib/cronograma/week";

interface CronogramaHeaderProps {
  projectName: string;
  address: string | null;
  today: Date;
  weekOffset: number;
}

/** Project title + week navigation. The actions menu (Exportar / Importar / Generar reporte) lands in a later phase. */
export function CronogramaHeader({ projectName, address, today, weekOffset }: CronogramaHeaderProps) {
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
