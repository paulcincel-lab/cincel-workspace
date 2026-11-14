import type { ReactNode } from "react";

import { Label } from "@/components/ui/shadcn/label";
import { cn } from "@/lib/utils";

/**
 * Building blocks of the Organización pages of Ajustes (canvas
 * `Ajustes-General`, `-Tema`, `-Horario`, `-Google`): the admin page heading,
 * the two-column field grid with labelled fields, the tinted status pill and
 * the inset option row. Colors only from tokens; nothing here changes with the
 * presentation style.
 */

/** `<h2>` page name (20 px / 600) + "Admin" pill + one-line description (13.5 px). */
export function AdminPageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div data-slot="admin-page-heading" className="flex flex-col gap-1">
      <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-foreground">
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">Admin</span>
      </h2>
      <p className="text-[13.5px] text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

/** Two columns (`repeat(2, minmax(0,1fr))`, gap 14 × 16 px); one column under 640 px. */
export function FieldGrid({ children, columns = 2, className }: { children: ReactNode; columns?: 2 | 4; className?: string }) {
  return (
    <div
      data-slot="field-grid"
      className={cn(
        "grid grid-cols-1 gap-x-4 gap-y-3.5",
        columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type FieldProps = {
  /** Id of the control the label is bound to. */
  htmlFor: string;
  label: string;
  hint?: string;
  /** Inline error; the control should point `aria-describedby` at `errorId(htmlFor)`. */
  error?: string | null;
  /** Spans both columns of the grid. */
  full?: boolean;
  children: ReactNode;
};

export function hintId(id: string): string {
  return `${id}-hint`;
}

export function errorId(id: string): string {
  return `${id}-error`;
}

/** Label 13 px / 500 (`--muted-foreground`), gap 6 px, the control, hint 12 px and the error under it. */
export function Field({ htmlFor, label, hint, error, full = false, children }: FieldProps) {
  return (
    <div data-slot="field" className={cn("flex min-w-0 flex-col gap-1.5", full && "sm:col-span-full")}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
      </Label>
      {children}
      {hint ? (
        <p id={hintId(htmlFor)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId(htmlFor)} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type PillTone = "neutral" | "success" | "warning" | "destructive" | "outline";

const PILL_TONE: Record<PillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning-ink",
  destructive: "bg-tint-destructive text-destructive",
  outline: "border border-border text-muted-foreground",
};

/** Status pill: 12.5 px / 500, radius 999, tinted by tone. */
export function TonePill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span
      data-slot="tone-pill"
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium",
        PILL_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Inset option row (`.row`): padding 12 × 14 px, radius 10 px, `--muted` background; wraps on narrow screens. */
export function InsetRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="inset-row"
      className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-muted px-3.5 py-3", className)}
    >
      {children}
    </div>
  );
}
