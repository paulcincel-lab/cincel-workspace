import { useId, type ReactNode } from "react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";

/**
 * One section of an Ajustes page (redesign FE §4.11).
 *
 * A labelled `<section>` holding a plain shadcn `Card`: title (h2), optional
 * description and header actions, then its `SettingsRow`s separated by
 * dividers. Color comes only from the card tokens; the section ignores the
 * presentation style.
 */
export type SettingsSectionProps = { title: string; description?: string; actions?: ReactNode; children: ReactNode };

export function SettingsSection({ title, description, actions, children }: SettingsSectionProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-slot="settings-section"
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={titleId}>{title}</h2>
          </CardTitle>
          {description ? <CardDescription id={descriptionId}>{description}</CardDescription> : null}
          {actions ? <CardAction data-slot="settings-section-actions">{actions}</CardAction> : null}
        </CardHeader>
        <CardContent className="flex flex-col divide-y">{children}</CardContent>
      </Card>
    </section>
  );
}
