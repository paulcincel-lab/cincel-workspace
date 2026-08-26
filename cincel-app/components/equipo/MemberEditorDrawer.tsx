"use client";

import Badge from "@/components/ui/Badge";
import { DEFAULT_SYSTEM_ACCESS_ROLE, SYSTEM_ACCESS_ROLES, normalizeSystemAccessRole } from "@/lib/data/roles";
import type { TeamCapabilities } from "@/lib/auth/permissions";
import type { TeamAvailability } from "@/lib/data/team";
import type { AccessPreviewState, MemberDraft } from "@/lib/equipo/types";

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

interface MemberEditorDrawerProps {
  show: boolean;
  onClose: () => void;
  editingId: number | null;
  draft: MemberDraft;
  onChangeDraft: React.Dispatch<React.SetStateAction<MemberDraft>>;
  formError: string;
  onSave: () => void;
  accessPreviewState: AccessPreviewState;
  isEditingSelfProtectedAdmin: boolean;
  teamCapabilities: TeamCapabilities;
  availabilityOptions: readonly string[];
}

/** Slide-in modal form for adding or editing a team member. */
export function MemberEditorDrawer({
  show,
  onClose,
  editingId,
  draft,
  onChangeDraft,
  formError,
  onSave,
  accessPreviewState,
  isEditingSelfProtectedAdmin,
  teamCapabilities,
  availabilityOptions,
}: MemberEditorDrawerProps) {
  if (!show) {
    return null;
  }

  const canSave = editingId === null ? teamCapabilities.canCreateCollaborator : teamCapabilities.canEditCollaborator;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white text-slate-800 shadow-xl">
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">{editingId === null ? "Agregar colaborador" : "Editar colaborador"}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-xl text-slate-400 hover:text-slate-700"
              aria-label="Cerrar"
            >
              x
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {formError ? (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Información laboral</h3>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-800">Nombre</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Puesto</label>
                <input
                  type="text"
                  value={draft.role}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, role: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
                <p className="mt-1 text-xs text-slate-500">Cargo que desempeña dentro de la empresa.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Area</label>
                <input
                  type="text"
                  value={draft.area}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, area: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
                <p className="mt-1 text-xs text-slate-500">Departamento al que pertenece.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Acceso</label>
                <select
                  value={draft.access}
                  onChange={(event) => {
                    const normalized = normalizeSystemAccessRole(event.target.value) ?? DEFAULT_SYSTEM_ACCESS_ROLE;
                    onChangeDraft((current) => ({ ...current, access: normalized }));
                  }}
                  disabled={!teamCapabilities.canChangeCollaboratorAccess}
                  title={teamCapabilities.canChangeCollaboratorAccess ? "" : "No tienes permiso para cambiar el acceso"}
                  className="w-full rounded-xl border px-4 py-2"
                >
                  {SYSTEM_ACCESS_ROLES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Nivel de acceso dentro de Cincel.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Capacidad</label>
                <input
                  type="number"
                  min={1}
                  value={draft.capacity}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    onChangeDraft((current) => ({ ...current, capacity: Number.isNaN(parsed) ? 1 : parsed }));
                  }}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Disponibilidad</label>
                <select
                  value={draft.availability}
                  onChange={(event) => {
                    const selected = event.target.value;

                    if (selected === "Otros...") {
                      const customAvailability = window.prompt("Nueva disponibilidad", "");
                      const trimmed = customAvailability?.trim();

                      if (trimmed) {
                        onChangeDraft((current) => ({ ...current, availability: trimmed as TeamAvailability }));
                      }

                      return;
                    }

                    onChangeDraft((current) => ({ ...current, availability: selected as TeamAvailability }));
                  }}
                  className="w-full rounded-xl border px-4 py-2"
                >
                  {availabilityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value="Otros...">Otros...</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Acceso al sistema</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Administra aquí el acceso, la contraseña temporal y el historial de uso del colaborador.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge
                  label={accessPreviewState.status}
                  color={accessPreviewState.status === "Acceso activo"
                    ? "blue"
                    : accessPreviewState.status === "Pendiente de primer acceso"
                      ? "yellow"
                      : accessPreviewState.status === "Sin contraseña temporal"
                        ? "red"
                        : "gray"}
                />
                <Badge
                  label={accessPreviewState.hasSystemAccess ? "Tiene acceso al sistema" : "Sin acceso al sistema"}
                  color={accessPreviewState.hasSystemAccess ? "blue" : "gray"}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-center justify-between gap-4">
                  <div>
                    <span className="block text-sm font-medium text-slate-800">Tiene acceso al sistema</span>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Si lo activas, el colaborador podrá iniciar sesión y ver el ERP según su acceso.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={draft.systemAccessEnabled}
                    onChange={(event) =>
                      onChangeDraft((current) => ({
                        ...current,
                        systemAccessEnabled: event.target.checked,
                        temporaryPassword: event.target.checked ? current.temporaryPassword : "",
                        temporaryPasswordConfirmation: event.target.checked ? current.temporaryPasswordConfirmation : "",
                      }))
                    }
                    className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                  />
                </label>
              </div>

              {draft.systemAccessEnabled ? (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-800">Contraseña temporal</label>
                    <input
                      type="password"
                      value={draft.temporaryPassword}
                      onChange={(event) =>
                        onChangeDraft((current) => ({ ...current, temporaryPassword: event.target.value }))
                      }
                      placeholder={editingId === null ? "Asignar contraseña temporal" : "Solo si vas a restablecer"}
                      className="w-full rounded-xl border px-4 py-2"
                    />
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {editingId === null
                        ? "Obligatoria al crear una cuenta con acceso al sistema."
                        : "Rellena este campo solo si vas a restablecer la contraseña."}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-800">Confirmar contraseña temporal</label>
                    <input
                      type="password"
                      value={draft.temporaryPasswordConfirmation}
                      onChange={(event) =>
                        onChangeDraft((current) => ({ ...current, temporaryPasswordConfirmation: event.target.value }))
                      }
                      placeholder="Repetir contraseña temporal"
                      className="w-full rounded-xl border px-4 py-2"
                    />
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">Debe coincidir con la contraseña temporal.</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-800">Último acceso</p>
                    <p className="mt-1 text-sm text-slate-600">{formatDateTime(accessPreviewState.lastLoginAt)}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-800">Último cambio de contraseña</p>
                    <p className="mt-1 text-sm text-slate-600">{formatDateTime(accessPreviewState.passwordUpdatedAt)}</p>
                  </div>
                </>
              ) : (
                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
                  Este colaborador no tendrá acceso al sistema ni podrá iniciar sesión. Podrá seguir asignado a proyectos,
                  tareas y recursos.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Información personal</h3>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Fecha nacimiento</label>
                <input
                  type="date"
                  value={draft.birthDate}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, birthDate: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Nacionalidad</label>
                <input
                  type="text"
                  value={draft.nationality}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, nationality: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Estado civil</label>
                <input
                  type="text"
                  value={draft.maritalStatus}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, maritalStatus: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">CURP</label>
                <input
                  type="text"
                  value={draft.curp}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, curp: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">RFC</label>
                <input
                  type="text"
                  value={draft.rfc}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, rfc: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Contacto</h3>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Celular</label>
                <input
                  type="text"
                  value={draft.phone}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, phone: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Correo institucional</label>
                <input
                  type="email"
                  value={draft.institutionalEmail}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, institutionalEmail: event.target.value }))}
                  disabled={isEditingSelfProtectedAdmin}
                  title={isEditingSelfProtectedAdmin ? "Tu correo administrador principal esta protegido" : ""}
                  className={`w-full rounded-xl border px-4 py-2 ${isEditingSelfProtectedAdmin ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""}`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-800">Direccion</label>
                <input
                  type="text"
                  value={draft.address}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, address: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Telefono de casa</label>
                <input
                  type="text"
                  value={draft.homePhone}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, homePhone: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Correo electronico personal</label>
                <input
                  type="email"
                  value={draft.personalEmail}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, personalEmail: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Contacto de emergencia</h3>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Nombre</label>
                <input
                  type="text"
                  value={draft.emergencyContactName}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, emergencyContactName: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Relacion</label>
                <input
                  type="text"
                  value={draft.emergencyContactRelation}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, emergencyContactRelation: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Telefono</label>
                <input
                  type="text"
                  value={draft.emergencyContactPhone}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, emergencyContactPhone: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Direccion</label>
                <input
                  type="text"
                  value={draft.emergencyContactAddress}
                  onChange={(event) => onChangeDraft((current) => ({ ...current, emergencyContactAddress: event.target.value }))}
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 border-t p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            title={canSave ? "" : "No tienes permiso para guardar cambios"}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${canSave ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-300"}`}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
