"use client";

import { useQuery } from "@tanstack/react-query";

import { MemberEditorDrawer } from "@/components/equipo/MemberEditorDrawer";
import { AvailabilityWeek } from "@/components/personas/AvailabilityWeek";
import { PersonasTabs, type PersonasTab } from "@/components/personas/PersonasTabs";
import { TeamGrid } from "@/components/personas/TeamGrid";
import { EmptyState } from "@/components/shell/EmptyState";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/shadcn/button";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { MEMBER_AVAILABILITY_OPTIONS } from "@/lib/equipo/availability-options";
import { useMemberEditor } from "@/lib/equipo/use-member-editor";
import { availabilityRows } from "@/lib/personas/team";
import { personasCountsOptions, personasEquipoOptions, personasPositionsOptions } from "@/lib/query/options/personas";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import type { PersonDatum } from "@/lib/types/widgets";

export type EquipoViewProps = {
  people: PersonDatum[];
  emails: Record<string, string | null>;
  /** `personas.counts()`; undefined while it loads. */
  counts: Record<PersonasTab, number> | undefined;
  /** `team.canCreateCollaborator`, resolved on the server (the save re-checks it). */
  canCreate: boolean;
};

export const PERSONAS_TITLE = "Personas";
export const PERSONAS_DESCRIPTION = "Equipo interno y directorio externo en un solo lugar.";

/**
 * `/personas` on the client (Query Migration 6): `personas.equipo()` and
 * `personas.counts()`, both prefetched by the page and hydrated, so the
 * first render makes no request.
 */
export function PersonasEquipoScreen() {
  const { data } = useQuery(personasEquipoOptions());
  const { data: counts } = useQuery(personasCountsOptions());
  if (!data) return null;
  return <EquipoView {...data} counts={counts} />;
}

/**
 * Personas · Equipo (redesign FE §3.6): header + `EstiloSwitch` + tabs, the
 * "Disponibilidad esta semana" widget and the team cards. Every style
 * difference lives in the people widgets; this view only composes them.
 * "Agregar persona" opens the existing collaborator editor, which saves with
 * one mutation and reads the puestos catalog only while it is open.
 */
export function EquipoView({ people, emails, counts, canCreate }: EquipoViewProps) {
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const editor = useMemberEditor({ authenticatedUser });
  const isAdministrator = authenticatedUser?.access === SYSTEM_ADMIN_ROLE;
  const { data: positionOptions = [] } = useQuery({
    ...personasPositionsOptions(),
    enabled: canCreate && editor.showEditor,
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={PERSONAS_TITLE}
        description={PERSONAS_DESCRIPTION}
        actions={
          <>
            <EstiloSwitch />
            {canCreate ? <Button onClick={editor.openAddEditor}>Agregar persona</Button> : null}
          </>
        }
      />
      <PersonasTabs active="equipo" counts={counts} />

      {people.length === 0 ? (
        <EmptyState
          title="Aún no hay personas en el equipo"
          action={canCreate ? { label: "Agregar", onClick: editor.openAddEditor } : undefined}
        />
      ) : (
        <>
          <AvailabilityWeek rows={availabilityRows(people)} />
          <TeamGrid people={people} emails={emails} />
        </>
      )}

      {canCreate ? (
        <MemberEditorDrawer
          show={editor.showEditor}
          onClose={editor.closeEditor}
          editingId={editor.editingId}
          draft={editor.draft}
          onChangeDraft={editor.setDraft}
          formError={editor.formError}
          onSave={editor.saveMember}
          saving={editor.saving}
          accessPreviewState={editor.accessPreviewState}
          isEditingSelfProtectedAdmin={editor.isEditingSelfProtectedAdmin}
          teamCapabilities={editor.teamCapabilities}
          availabilityOptions={MEMBER_AVAILABILITY_OPTIONS}
          positionOptions={positionOptions}
          canManagePositions={isAdministrator}
          googleManaged={editor.editingGoogleManaged}
          googleAccess={editor.editingGoogleAccess}
          canRecheckAccess={isAdministrator}
        />
      ) : null}
    </div>
  );
}
