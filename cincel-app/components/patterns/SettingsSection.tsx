import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One section of an Ajustes page (redesign FE §4.11, canvas `Ajustes-*`).
 *
 * A labelled `<section>` card: `--card` background, 1 px `--border`, 14 px
 * radius, soft shadow, 20 × 24 px padding and 14 px between its parts. The
 * header holds an optional leading tile, the title (`<h2>`, or `<h3>` under an
 * admin page heading), an optional description and the header actions on the
 * right. With `inline` the header and the children (one control) share one
 * row, title left and control right, wrapping on narrow screens. Consecutive
 * `SettingsRow`s are separated by a divider. Color comes only from tokens; the
 * section ignores the presentation style.
 */
export type SettingsSectionProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Title left, the children (one control) right, on one wrapping row. */
  inline?: boolean;
  /** Heading level of the title: 2 on personal pages, 3 under an admin page heading. */
  level?: 2 | 3;
  /** Leading tile before the title (for example a 40 px service icon). */
  icon?: ReactNode;
  children?: ReactNode;
};

export function SettingsSection({
  title,
  description,
  actions,
  inline = false,
  level = 2,
  icon,
  children,
}: SettingsSectionProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const Heading = level === 3 ? "h3" : "h2";
  const hasContent = children !== undefined && children !== null && children !== false;

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-slot="settings-section"
      data-inline={inline ? "" : undefined}
      className={cn(
        "anim-in flex min-w-0 gap-3.5 rounded-[14px] border border-border bg-card px-6 py-5 text-sm text-card-foreground shadow-xs",
        inline ? "flex-row flex-wrap items-center justify-between" : "flex-col",
      )}
    >
      <div
        data-slot="settings-section-header"
        className={cn("flex min-w-0 flex-wrap items-start justify-between gap-3", inline && "flex-1")}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {icon}
          <div className="flex min-w-0 flex-col gap-1">
            <Heading id={titleId} className="text-[15px] leading-snug font-semibold text-foreground">
              {title}
            </Heading>
            {description ? (
              <div id={descriptionId} data-slot="settings-section-description" className="text-[13px] text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div data-slot="settings-section-actions" className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {hasContent ? (
        <div
          data-slot="settings-section-content"
          className={cn(
            "flex min-w-0 flex-col gap-3.5",
            "[&>[data-slot=settings-row]+[data-slot=settings-row]]:border-t [&>[data-slot=settings-row]+[data-slot=settings-row]]:border-border [&>[data-slot=settings-row]+[data-slot=settings-row]]:pt-3.5",
            inline && "shrink-0",
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
