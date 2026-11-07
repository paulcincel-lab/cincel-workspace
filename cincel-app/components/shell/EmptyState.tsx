import type { LucideIcon } from "lucide-react";

/**
 * Empty state (redesign FE §4.2): icon, title, description and an optional
 * action, on shadcn primitives.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?(): void };
};

export function EmptyState(props: EmptyStateProps) {
  void props;
  return null;
}
