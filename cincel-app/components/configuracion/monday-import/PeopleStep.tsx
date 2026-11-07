"use client";

import { useEffect } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { CreateStaffButton } from "@/components/configuracion/monday-import/CreateStaffButton";
import { matchStaff, personRowId, splitMondayPeople } from "@/lib/monday-import/people";
import { countLabel, decodePerson, encodePerson, setPerson, unmappedPeople } from "@/lib/monday-import/wizard-steps";
import type { MappingInput, PersonTarget } from "@/scripts/monday/mapping.schema";
import type { MondayExportSource, MondayImportChoices } from "@/lib/types/monday-import";

type MondayUser = MondayExportSource["users"][number];
type StaffChoice = MondayImportChoices["staff"][number];

/**
 * Paso 4: each monday user → existing staff (suggested by email, then name), a staff member made here with
 * "Crear integrante", a Directorio contact, or ignore. Deleted monday users and bots are listed last under
 * "Eliminados en monday", ignored by default. Each row has the id `personRowId(user.id)` for links from the
 * Vista previa.
 */
export function PeopleStep({
  mapping,
  source,
  choices,
  runId,
  onMappingChange,
  onStaffCreated,
  focusPersonId,
}: {
  mapping: MappingInput;
  source: MondayExportSource;
  choices: MondayImportChoices;
  /** Enables "Crear integrante"; without it only existing staff can be chosen. */
  runId?: string | null;
  onMappingChange: (mapping: MappingInput) => void;
  /** A staff member "Crear integrante" made, so the caller adds it to `choices.staff`. */
  onStaffCreated?: (staff: StaffChoice) => void;
  /** The monday user whose row a Vista previa "Corregir" opens (#689): scrolled into view. */
  focusPersonId?: string | null;
}) {
  useEffect(() => {
    if (focusPersonId) document.getElementById(personRowId(focusPersonId))?.scrollIntoView?.({ block: "center" });
  }, [focusPersonId]);

  // A staff member made here may not be in `choices` yet (choices load once): list it from the mapping.
  const known = new Set(choices.staff.map((member) => member.id));
  const madeHere: StaffChoice[] = source.users.flatMap((user) => {
    const target = mapping.people[user.id];
    return target?.action === "staff" && target.created && !known.has(target.staffId)
      ? [{ id: target.staffId, name: user.name, email: user.email }]
      : [];
  });
  const staff = [...choices.staff, ...madeHere];
  const staffChoices: Choice[] = staff.map((member) => ({
    value: `staff:${member.id}`,
    label: member.email ? `${member.name} (${member.email})` : member.name,
  }));
  const options: Choice[] = [
    { value: "unmapped", label: "Sin asignar" },
    ...staffChoices,
    { value: "contact", label: "Contacto nuevo del Directorio" },
    ...choices.clients.map((client) => ({ value: `contact:${client.id}`, label: `Contacto: ${client.name}` })),
    { value: "ignore", label: "Ignorar" },
  ];
  const { people, retired } = splitMondayPeople(source.users);
  const pending = unmappedPeople(mapping, { ...source, users: people }).length;

  function choose(user: MondayUser, value: string) {
    const current = mapping.people[user.id];
    // Picking the same staff member again keeps the "created here" mark, so a rollback still removes it.
    if (current?.action === "staff" && value === encodePerson(current)) return;
    onMappingChange(setPerson(mapping, user.id, decodePerson(value)));
  }

  function created(user: MondayUser, member: StaffChoice) {
    onStaffCreated?.(member);
    const target: PersonTarget = { action: "staff", staffId: member.id, created: true };
    onMappingChange(setPerson(mapping, user.id, target));
  }

  function row(user: MondayUser, isRetired: boolean) {
    const target = mapping.people[user.id];
    const value = encodePerson(target);
    const suggestion = isRetired ? null : matchStaff(user, staff);
    const canCreate = Boolean(runId) && !isRetired && target?.action !== "staff";
    return (
      <TableRow key={user.id} id={personRowId(user.id)}>
        <TableCell className="align-top">
          <span className="text-foreground">{user.name}</span>
          {user.kind === "guest" ? (
            <Badge variant="outline" className="ml-2">
              Invitado
            </Badge>
          ) : null}
          {target?.action === "staff" && target.created ? (
            <Badge variant="secondary" className="ml-2">
              Integrante nuevo
            </Badge>
          ) : null}
          {user.email ? <span className="block text-xs text-muted-foreground">{user.email}</span> : null}
        </TableCell>
        <TableCell className="space-y-2">
          <ChoiceSelect
            label={`Equivalente de ${user.name}`}
            value={value}
            choices={options}
            onChange={(next) => choose(user, next)}
          />
          {suggestion && value !== `staff:${suggestion.member.id}` ? (
            <p className="whitespace-normal text-xs text-muted-foreground">
              Sugerido por {suggestion.by === "email" ? "correo" : "nombre"}: {suggestion.member.name}
            </p>
          ) : null}
          {canCreate && runId ? (
            <CreateStaffButton
              runId={runId}
              user={user}
              positions={choices.positions ?? []}
              onCreated={(member) => created(user, member)}
            />
          ) : null}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {pending === 0
          ? "Todas las personas tienen equivalente."
          : `${countLabel(pending, "persona sin asignar", "personas sin asignar")}: sus tareas quedan sin responsable.`}
      </p>
      {runId ? (
        <p className="text-sm text-muted-foreground">
          Crear integrante lo da de alta con el nombre y correo de monday; queda pendiente hasta que entre con Google.
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Persona de monday</TableHead>
            <TableHead className="w-1/2">En Cincel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((user) => row(user, false))}
          {retired.length > 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="whitespace-normal">
                <span className="font-medium text-foreground">Eliminados en monday</span>
                <span className="block text-xs text-muted-foreground">
                  Usuarios eliminados y bots de monday. Se ignoran salvo que elijas otra cosa.
                </span>
              </TableCell>
            </TableRow>
          ) : null}
          {retired.map((user) => row(user, true))}
        </TableBody>
      </Table>
    </div>
  );
}
