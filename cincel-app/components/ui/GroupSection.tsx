import type { ReactNode } from "react";

type Props = {
  title: string;
  count: number;
  archivedCount?: number;
  children: ReactNode;
  titleClassName?: string;
  headerClassName?: string;
  actions?: ReactNode;
};

export default function GroupSection({
  title,
  count,
  archivedCount = 0,
  children,
  titleClassName,
  headerClassName,
  actions,
}: Props) {
  return (
    <section className="border-b border-border last:border-b-0">
      <div className={`flex items-center justify-between px-6 py-3 ${headerClassName ?? "bg-muted"}`}>
        <div>
          <h2 className={`text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground ${titleClassName ?? ""}`.trim()}>
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 ? (
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {archivedCount} archivada{archivedCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {actions ? <div>{actions}</div> : null}
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {count} {count === 1 ? "tarea" : "tareas"}
          </span>
        </div>
      </div>
      {children}
      <div className="mx-6 border-b border-border" />
    </section>
  );
}
