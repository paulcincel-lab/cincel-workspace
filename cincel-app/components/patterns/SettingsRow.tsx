import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/shadcn/label";

/**
 * One labelled row of a `SettingsSection` (redesign FE §4.11).
 *
 * Label and optional description on the left, the control on the right
 * (stacked on narrow screens). With `htmlFor` the label is a `<label>` bound to
 * the control with that id; without it (compound controls such as radio or
 * toggle groups) the control is wrapped in a `group` named by the label and
 * described by the description.
 */
export type SettingsRowProps = { label: string; description?: string; control: ReactNode; htmlFor?: string };

export function SettingsRow({ label, description, control, htmlFor }: SettingsRowProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const descriptionId = `${baseId}-description`;

  return (
    <div
      data-slot="settings-row"
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-1">
        {htmlFor ? (
          <Label id={labelId} htmlFor={htmlFor}>
            {label}
          </Label>
        ) : (
          <span id={labelId} data-slot="settings-row-label" className="text-sm font-medium">
            {label}
          </span>
        )}
        {description ? (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {htmlFor ? (
        <div data-slot="settings-row-control" className="shrink-0">
          {control}
        </div>
      ) : (
        <div
          role="group"
          aria-labelledby={labelId}
          aria-describedby={description ? descriptionId : undefined}
          data-slot="settings-row-control"
          className="shrink-0"
        >
          {control}
        </div>
      )}
    </div>
  );
}
