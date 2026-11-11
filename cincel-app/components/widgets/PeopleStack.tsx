import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/shadcn/avatar";
import { getPersonInitials } from "@/components/ui/TeamMultiSelect";
import { PEOPLE_EMPTY, PEOPLE_MAX_AVATARS, PEOPLE_OVERFLOW } from "@/components/widgets/editable-cell";

export type PeopleStackProps = {
  people: readonly { id: string; name: string }[];
  /** What the people are ("Apoyo"): the screen reader text reads "Apoyo: Ana, Luis". */
  label?: string;
};

/**
 * A people cell at rest (#1038, e.g. a task's equipo de apoyo): up to
 * `PEOPLE_MAX_AVATARS` avatars, then "+n"; "—" with nobody. The names are the
 * tooltip and the screen reader text.
 */
export function PeopleStack({ people, label }: PeopleStackProps): ReactNode {
  if (people.length === 0) return <span className="text-muted-foreground">{PEOPLE_EMPTY}</span>;
  const names = people.map((p) => p.name).join(", ");
  const shown = people.slice(0, PEOPLE_MAX_AVATARS);
  const overflow = people.length - shown.length;
  return (
    <span data-slot="people-stack" title={names} className="inline-flex items-center align-middle">
      <span className="sr-only">{label ? `${label}: ${names}` : names}</span>
      <AvatarGroup aria-hidden="true" className="*:data-[slot=avatar]:ring-card">
        {shown.map((person) => (
          <Avatar key={person.id} className="size-6">
            <AvatarFallback className="bg-foreground text-[9px] font-bold text-background">
              {getPersonInitials(person.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {overflow > 0 ? (
          <AvatarGroupCount className="size-6 text-[10px] font-semibold ring-card">{PEOPLE_OVERFLOW(overflow)}</AvatarGroupCount>
        ) : null}
      </AvatarGroup>
    </span>
  );
}
