import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/shadcn/breadcrumb";

export type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Redesign FE §4.2: the trail above the title; the last item (or any without `href`) is plain text. */
  breadcrumb?: { label: string; href?: string }[];
  /** Right side; wraps under 768 px. */
  actions?: ReactNode;
  /** Redesign FE §4.2 (e.g. "Solo tú lo ves", "Admin"), shown next to the title. */
  badge?: ReactNode;
};

/**
 * The title + description + actions toolbar repeated at the top of every
 * page (Proyectos, Equipo, Directorio, Actividades, Recursos) — factored out
 * once instead of hand-rolled per page.
 *
 * Redesign (FE §4.2): optional breadcrumb and badge; on redesign pages
 * (`<html data-style>` is only emitted with the redesign on, so legacy pages
 * keep today's sizes) the title follows the org type scale
 * (`--type-pageTitle-*`), the description is 15 px and the actions wrap with
 * a 10 px gap.
 */
export function PageHeader({ title, description, breadcrumb, actions, badge }: PageHeaderProps) {
  const trail = breadcrumb?.filter((item) => item.label) ?? [];
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4" data-slot="page-header">
      <div className="min-w-0">
        {trail.length > 0 ? (
          <Breadcrumb aria-label="Ruta" className="mb-1">
            <BreadcrumbList className="text-xs">
              {trail.map((item, index) => {
                const last = index === trail.length - 1;
                return (
                  <Fragment key={`${index}-${item.label}`}>
                    <BreadcrumbItem>
                      {item.href && !last ? (
                        <BreadcrumbLink render={<Link href={item.href} />}>{item.label}</BreadcrumbLink>
                      ) : last ? (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </BreadcrumbItem>
                    {last ? null : <BreadcrumbSeparator />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold [html[data-style]_&]:text-[length:var(--type-pageTitle-size,22px)] [html[data-style]_&]:leading-tight [html[data-style]_&]:tracking-[-0.02em] [html[data-style]_&]:[font-weight:var(--type-pageTitle-weight,600)]">
            {title}
          </h1>
          {badge ? <div className="flex items-center">{badge}</div> : null}
        </div>
        {description ? <p className="text-xs text-muted-foreground [html[data-style]_&]:mt-1.5 [html[data-style]_&]:text-[15px]">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2 [html[data-style]_&]:flex-wrap [html[data-style]_&]:items-center [html[data-style]_&]:gap-2.5">
          {actions}
        </div> : null}
    </div>
  );
}
