"use client";

import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";

const NO_CLIENT = "__no_client__";
const NO_STAFF = "__no_staff__";

export const ASSIGN_CLIENT_HINT = "Al asignar el cliente se cierra la tarea «Asignar cliente y origen».";

export type ProjectAdminValue = {
  clientId: string | null;
  origin: string | null;
  originStaffId: string | null;
};

export interface ProjectAdminFieldsProps {
  value: ProjectAdminValue;
  onChange: (next: ProjectAdminValue) => void;
  clients: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
  /** The saved project has no client yet: shows the admin-task hint under Cliente. */
  projectHasClient: boolean;
}

/**
 * Admin-only ficha fields (FE §3.5, §4.4): optional Cliente, Origen and
 * "Quién trajo el proyecto". The ficha renders it for administrators only and
 * saves the values through `updateProjectAction(id, { clientId, origin, originStaffId })`.
 */
export function ProjectAdminFields({ value, onChange, clients, staff, projectHasClient }: ProjectAdminFieldsProps) {
  return (
    <>
      <FormField className="sm:col-span-2">
        <Label htmlFor="project-admin-client" className="block text-sm font-normal text-muted-foreground">
          Cliente
        </Label>
        <Select
          items={{ [NO_CLIENT]: "Sin cliente", ...Object.fromEntries(clients.map((c) => [c.id, c.name])) }}
          value={value.clientId ?? NO_CLIENT}
          onValueChange={(v) => onChange({ ...value, clientId: v === NO_CLIENT || !v ? null : (v as string) })}
        >
          <SelectTrigger
            id="project-admin-client"
            className="mt-1 w-full"
            aria-describedby={projectHasClient ? undefined : "project-admin-client-hint"}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CLIENT}>Sin cliente</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {projectHasClient ? null : (
          <p id="project-admin-client-hint" className="mt-1 text-xs text-muted-foreground">
            {ASSIGN_CLIENT_HINT}
          </p>
        )}
      </FormField>
      <FormField>
        <Label htmlFor="project-admin-origin" className="block text-sm font-normal text-muted-foreground">
          Origen
        </Label>
        <Input
          id="project-admin-origin"
          value={value.origin ?? ""}
          maxLength={120}
          onChange={(e) => onChange({ ...value, origin: e.target.value })}
          className="mt-1"
        />
      </FormField>
      <FormField>
        <Label htmlFor="project-admin-origin-staff" className="block text-sm font-normal text-muted-foreground">
          Quién trajo el proyecto
        </Label>
        <Select
          items={{ [NO_STAFF]: "Nadie del equipo", ...Object.fromEntries(staff.map((s) => [s.id, s.name])) }}
          value={value.originStaffId ?? NO_STAFF}
          onValueChange={(v) => onChange({ ...value, originStaffId: v === NO_STAFF || !v ? null : (v as string) })}
        >
          <SelectTrigger id="project-admin-origin-staff" className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_STAFF}>Nadie del equipo</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </>
  );
}

/** Trimmed patch for `updateProjectAction`: an empty origin is saved as null. */
export function projectAdminPatch(value: ProjectAdminValue): ProjectAdminValue {
  const origin = value.origin?.trim() ?? "";
  return { clientId: value.clientId, origin: origin === "" ? null : origin, originStaffId: value.originStaffId };
}
