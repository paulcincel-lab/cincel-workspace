import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  description?: string;
  /** Redesign FE §4.2; rendered once the v3 header lands. */
  breadcrumb?: { label: string; href?: string }[];
  /** Right side; wraps under 768 px. */
  actions?: ReactNode;
  /** Redesign FE §4.2 (e.g. "Solo tú lo ves", "Admin"); rendered once the v3 header lands. */
  badge?: ReactNode;
};

/**
 * The title + description + actions toolbar repeated at the top of every
 * page (Proyectos, Equipo, Directorio, Actividades, Recursos) — factored out
 * once instead of hand-rolled per page.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
