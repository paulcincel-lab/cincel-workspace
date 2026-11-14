import type { ReactNode } from "react";

import { AvatarCircle, UnassignedAvatar, type PersonAvatarSize } from "@/components/v2/status/PersonAvatar";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/shadcn/avatar";
import { PEOPLE_MAX_AVATARS, PEOPLE_OVERFLOW } from "@/components/widgets/editable-cell";

export type PeopleStackProps = {
  people: readonly { id: string; name: string }[];
  /** What the people are ("Apoyo"): the screen reader text reads "Apoyo: Ana, Luis". */
  label?: string;
  size?: PersonAvatarSize;
  /** Shown with nobody: the dashed placeholder (default) with this tooltip. */
  emptyLabel?: string;
};

/**
 * A people cell at rest (e.g. a task's equipo de apoyo): up to `PEOPLE_MAX_AVATARS`
 * round avatars (photo or initials) overlapping, then "+n"; the dashed placeholder
 * with nobody. All the names are the tooltip and the screen reader text.
 */
export function PeopleStack({ people, label, size = "sm", emptyLabel }: PeopleStackProps): ReactNode {
  if (people.length === 0) return <UnassignedAvatar size={size} label={emptyLabel} />;
  const names = people.map((p) => p.name).join(", ");
  const shown = people.slice(0, PEOPLE_MAX_AVATARS);
  const overflow = people.length - shown.length;
  return (
    <span data-slot="people-stack" title={names} className="inline-flex items-center align-middle">
      <span className="sr-only">{label ? `${label}: ${names}` : names}</span>
      <AvatarGroup aria-hidden="true" className="*:data-[slot=avatar]:ring-card">
        {shown.map((person) => (
          <AvatarCircle key={person.id} id={person.id} name={person.name} size={size} decorative />
        ))}
        {overflow > 0 ? (
          <AvatarGroupCount className="size-6 text-[10px] font-semibold ring-card">{PEOPLE_OVERFLOW(overflow)}</AvatarGroupCount>
        ) : null}
      </AvatarGroup>
    </span>
  );
}

/**
 * The responsable of a task: round avatar with the name next to it (`showName`),
 * or avatar only with the name as tooltip; the dashed placeholder when nobody.
 */
export function ResponsableAvatar({
  person,
  size = "sm",
  showName = true,
  showUnassignedText = false,
  className,
}: {
  person: { id: string; name: string } | null | undefined;
  size?: PersonAvatarSize;
  showName?: boolean;
  /** Keep the "Sin asignar" text next to the placeholder (Analítico). */
  showUnassignedText?: boolean;
  className?: string;
}): ReactNode {
  if (!person) return <UnassignedAvatar size={size} showLabel={showUnassignedText} className={className} />;
  return (
    <span data-slot="responsable" title={person.name} className={`inline-flex max-w-full items-center gap-2 align-middle ${className ?? ""}`}>
      <AvatarCircle id={person.id} name={person.name} size={size} decorative={showName} />
      <span className={showName ? "min-w-0 truncate" : "sr-only"}>{person.name}</span>
    </span>
  );
}
