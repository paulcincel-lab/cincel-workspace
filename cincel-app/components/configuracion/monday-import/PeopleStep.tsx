"use client";

import { Badge } from "@/components/ui/shadcn/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect, type Choice } from "@/components/configuracion/monday-import/ChoiceSelect";
import { countLabel, decodePerson, encodePerson, setPerson, suggestStaff, unmappedPeople } from "@/lib/monday-import/wizard-steps";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayExportSource, MondayImportChoices } from "@/lib/types/monday-import";

/** Paso 4: each monday user → existing staff (suggested by email), a Directorio contact, or ignore. */
export function PeopleStep({
  mapping,
  source,
  choices,
  onMappingChange,
}: {
  mapping: MappingInput;
  source: MondayExportSource;
  choices: MondayImportChoices;
  onMappingChange: (mapping: MappingInput) => void;
}) {
  const staffChoices: Choice[] = choices.staff.map((member) => ({
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
  const pending = unmappedPeople(mapping, source).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {pending === 0
          ? "Todas las personas tienen equivalente."
          : `${countLabel(pending, "persona sin asignar", "personas sin asignar")}: sus tareas quedan sin responsable.`}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Persona de monday</TableHead>
            <TableHead className="w-1/2">En Cincel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {source.users.map((user) => {
            const suggestion = suggestStaff(user, choices.staff);
            const value = encodePerson(mapping.people[user.id]);
            return (
              <TableRow key={user.id}>
                <TableCell className="align-top">
                  <span className="text-foreground">{user.name}</span>
                  {user.kind === "guest" ? (
                    <Badge variant="outline" className="ml-2">
                      Invitado
                    </Badge>
                  ) : null}
                  {user.email ? <span className="block text-xs text-muted-foreground">{user.email}</span> : null}
                </TableCell>
                <TableCell className="space-y-1">
                  <ChoiceSelect
                    label={`Equivalente de ${user.name}`}
                    value={value}
                    choices={options}
                    onChange={(next) => onMappingChange(setPerson(mapping, user.id, decodePerson(next)))}
                  />
                  {suggestion && value !== `staff:${suggestion.id}` ? (
                    <p className="whitespace-normal text-xs text-muted-foreground">
                      Sugerido por correo: {suggestion.name}
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
