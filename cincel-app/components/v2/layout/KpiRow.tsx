import { cn } from "@/lib/utils";

export interface KpiTileProps {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "ok";
}

/**
 * One KPI tile ("Proyectos activos", "Vencidas", "Saturados"…). `tone` is the
 * only place color earns its keep on a KPI strip — everything else stays
 * monochrome. Use inside <KpiRow>.
 */
export function KpiTile({ label, value, tone = "default" }: KpiTileProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-3.5">
      <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          tone === "warn" && "text-destructive",
          tone === "ok" && "text-success-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

interface KpiRowProps {
  tiles: KpiTileProps[];
}

/** A responsive row of KpiTile — the KPI strip repeated across v2 pages. */
export function KpiRow({ tiles }: KpiRowProps) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map((tile) => (
        <KpiTile key={tile.label} {...tile} />
      ))}
    </div>
  );
}
