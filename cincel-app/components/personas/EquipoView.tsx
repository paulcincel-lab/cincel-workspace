"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { MemberEditorDrawer } from "@/components/equipo/MemberEditorDrawer";
import { EquipoAnalitico } from "@/components/personas/EquipoAnalitico";
import { PersonasTabs, type PersonasTab } from "@/components/personas/PersonasTabs";
import { TeamMemberActions } from "@/components/personas/TeamGrid";
import { EmptyState } from "@/components/shell/EmptyState";
import { Button } from "@/components/ui/shadcn/button";
import { PageHeader } from "@/components/widgets/PageHeader";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { PeopleLoadBoard } from "@/components/widgets/PeopleLoadBoard";
import { PeopleEsencialTeam } from "@/components/widgets/PeopleWidget";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { MEMBER_AVAILABILITY_OPTIONS } from "@/lib/equipo/availability-options";
import { useMemberEditor } from "@/lib/equipo/use-member-editor";
import { personasCountsOptions, personasEquipoOptions, personasPositionsOptions } from "@/lib/query/options/personas";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import type { WorkflowRef } from "@/lib/types/core";
import type { PersonDatum } from "@/lib/types/widgets";

export type EquipoViewProps = {
  people: PersonDatum[];
  emails: Record<string, string | null>;
  /** `personas.counts()`; undefined while it loads. */
  counts: Record<PersonasTab, number> | undefined;
  /** `team.canCreateCollaborator`, resolved on the server (the save re-checks it). */
  canCreate: boolean;
  /** `activities.canChangeResponsible`, resolved on the server. */
  canAssign: boolean;
  /** `activities.canCreateActivity`, resolved on the server (the create re-checks it). */
  canCreateTask: boolean;
  /** Active etapas in order ("Personas por etapa" in Visual). */
  etapas?: WorkflowRef[];
};

export const PERSONAS_TITLE = "Personas";
export const PERSONAS_DESCRIPTION = "Quién está libre, quién va cargado y quién sale de vacaciones.";
export const PERSONAS_VISUAL_DESCRIPTION = "El equipo de un vistazo: carga, etapas y quién sale de vacaciones.";

/**
 * `/personas` on the client (Query Migration 6): `personas.equipo()` and
 * `personas.counts()`, both prefetched by the page and hydrated, so the
 * first render makes no request.
 */
export function PersonasEquipoScreen() {
  const { data } = useQuery(personasEquipoOptions());
  const { data: counts } = useQuery(personasCountsOptions());
  if (!data) {
    return (
      <PageStyleLayout
        visual={() => <PeopleLoadBoard people={[]} canAssign={false} loading />}
        esencial={() => null}
        analitico={() => null}
      />
    );
  }
  return <EquipoView {...data} counts={counts} />;
}

/**
 * Personas · Equipo (redesign FE §3.6): header (with the Estilo switch) + tabs and
 * one body per style through `PageStyleLayout`: Visual the load board
 * (`PeopleLoadBoard`), Esencial the person cards (`PeopleEsencialTeam`),
 * Analítico `EquipoAnalitico` (its own header, tabs and table). Every style
 * difference lives in the widgets; this view only composes them.
 * "Agregar persona" opens the existing collaborator editor, which saves with
 * one mutation and reads the puestos catalog only while it is open.
 */
export function EquipoView({ people, emails, counts, canCreate, canAssign, canCreateTask, etapas }: EquipoViewProps) {
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const editor = useMemberEditor({ authenticatedUser });
  const isAdministrator = authenticatedUser?.access === SYSTEM_ADMIN_ROLE;
  const { data: positionOptions = [] } = useQuery({
    ...personasPositionsOptions(),
    enabled: canCreate && editor.showEditor,
  });

  // Header, tabs and the empty team are the same in every style; only the description and the body change.
  const page = (description: string, body: () => ReactNode) => (
    <>
      <PageHeader
        title={PERSONAS_TITLE}
        description={description}
        actions={canCreate ? <Button onClick={editor.openAddEditor}>Agregar persona</Button> : null}
      />
      <PersonasTabs active="equipo" counts={counts} />
      {people.length === 0 ? (
        <EmptyState
          title="Aún no hay personas en el equipo"
          action={canCreate ? { label: "Agregar", onClick: editor.openAddEditor } : undefined}
        />
      ) : (
        body()
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageStyleLayout
        visual={() =>
          page(PERSONAS_VISUAL_DESCRIPTION, () => (
            <PeopleLoadBoard
              people={people}
              etapas={etapas}
              canAssign={canAssign}
              actions={(person) => <TeamMemberActions person={person} email={emails[person.id] ?? null} />}
            />
          ))
        }
        esencial={() =>
          page(PERSONAS_DESCRIPTION, () => (
            <PeopleEsencialTeam people={people} canCreateTask={canCreateTask} canAssign={canAssign} />
          ))
        }
        analitico={() => (
          <EquipoAnalitico
            people={people}
            counts={counts}
            canCreate={canCreate}
            canAssign={canAssign}
            canCreateTask={canCreateTask}
            onAddPerson={editor.openAddEditor}
          />
        )}
      />

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
