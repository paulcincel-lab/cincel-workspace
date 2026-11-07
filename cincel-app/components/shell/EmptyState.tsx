import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/shadcn/button";

/**
 * Empty state (redesign FE §4.2, frame `EstadosSistema`): icon, title,
 * description and an optional action (a link when `href` is set, otherwise a
 * button), on shadcn primitives. Works from server and client components; an
 * `onClick` action needs a client caller.
 */
export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?(): void };
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className="flex flex-col items-center gap-2.5 px-6 py-9 text-center">
      {Icon ? (
        <span
          data-slot="empty-state-icon"
          className="inline-flex size-13 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-xs text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <div className="mt-1">
          {action.href ? (
            <Link href={action.href} className={buttonVariants()}>
              {action.label}
            </Link>
          ) : (
            <Button type="button" onClick={() => action.onClick?.()}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
