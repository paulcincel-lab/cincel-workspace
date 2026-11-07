"use client";

import Link from "next/link";

import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { cuttoLinks } from "@/lib/integrations/cutto-links";
import { teamShow } from "@/lib/personas/team";
import type { PersonDatum } from "@/lib/types/widgets";

export type TeamGridProps = {
  people: PersonDatum[];
  /** Institutional email per staff id, from the staff DTO the page already loads (FE §4.9). */
  emails?: Record<string, string | null>;
};

/**
 * Per-person actions of the Equipo cards: "Ver tareas", correo and the Cutto
 * chat deep link (a link in a new tab; no Cutto UI inside Cincel, FE §4.9).
 */
export function TeamMemberActions({ person, email }: { person: PersonDatum; email: string | null }) {
  const action = buttonVariants({ variant: "ghost", size: "sm" });
  return (
    <div className="flex flex-wrap gap-1">
      <Link
        href={`/tareas?vista=lista&responsable=${encodeURIComponent(person.id)}`}
        className={action}
        aria-label={`Ver tareas de ${person.name}`}
      >
        Ver tareas
      </Link>
      {email ? (
        <>
          <a href={`mailto:${email}`} className={action} aria-label={`Enviar correo a ${person.name}`}>
            Correo
          </a>
          <a
            href={cuttoLinks.personChatUrl(email) ?? undefined}
            target="_blank"
            rel="noopener"
            className={action}
            aria-label={`Abrir chat en Cutto con ${person.name} (se abre en una pestaña nueva)`}
          >
            Abrir chat en Cutto
          </a>
        </>
      ) : null}
    </div>
  );
}

/**
 * Equipo cards (redesign FE §3.6, §4.7): an instance of `PeopleWidget`
 * (avatar, name → detail, puesto, tramo, "n proyectos", load). Hours appear
 * only when the server returned them.
 */
export function TeamGrid({ people, emails = {} }: TeamGridProps) {
  return (
    <PeopleWidget
      people={people}
      show={teamShow(people, ["load", "projects"])}
      layout="cards"
      actions={(person) => <TeamMemberActions person={person} email={emails[person.id] ?? null} />}
    />
  );
}
