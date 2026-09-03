"use client";

import AppAvatar from "@/components/ui/AppAvatar";
import AppBadge from "@/components/ui/AppBadge";
import type { TeamMemberWithWorkload } from "@/lib/equipo/types";

interface MemberProfileModalProps {
  member: TeamMemberWithWorkload;
  onClose: () => void;
}

/** Read-only personal profile overlay for a team member. */
export function MemberProfileModal({ member, onClose }: MemberProfileModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Ficha personal</h2>
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

        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <AppAvatar name={member.name} />
            <AppBadge label={member.active ? "Activo" : "Desactivado"} color={member.active ? "blue" : "gray"} />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-slate-800">
            <p><span className="font-medium">Fecha nacimiento:</span> {member.birthDate || "-"}</p>
            <p><span className="font-medium">Nacionalidad:</span> {member.nationality || "-"}</p>
            <p><span className="font-medium">Celular:</span> {member.phone || "-"}</p>
            <p><span className="font-medium">Correo institucional:</span> {member.institutionalEmail || "-"}</p>
            <p><span className="font-medium">Direccion:</span> {member.address || "-"}</p>
            <p><span className="font-medium">Estado civil:</span> {member.maritalStatus || "-"}</p>
            <p><span className="font-medium">Telefono de casa:</span> {member.homePhone || "-"}</p>
            <p><span className="font-medium">Correo personal:</span> {member.personalEmail || "-"}</p>
            <p><span className="font-medium">CURP:</span> {member.curp || "-"}</p>
            <p><span className="font-medium">RFC:</span> {member.rfc || "-"}</p>
            <p><span className="font-medium">Puesto:</span> {member.role}</p>
            <p><span className="font-medium">Area:</span> {member.area}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
            <p className="font-medium">Contacto de emergencia</p>
            <p className="mt-1"><span className="font-medium">Nombre:</span> {member.emergencyContact.name || "-"}</p>
            <p className="mt-1"><span className="font-medium">Relacion:</span> {member.emergencyContact.relation || "-"}</p>
            <p className="mt-1"><span className="font-medium">Telefono:</span> {member.emergencyContact.phone || "-"}</p>
            <p className="mt-1"><span className="font-medium">Direccion:</span> {member.emergencyContact.address || "-"}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            <p className="font-medium">Carga actual</p>
            <p className="mt-1">Asignadas: {member.assigned} | Soporte: {member.support} | Total: {member.total}</p>
            <p className="mt-1">Ocupacion: {member.occupancy}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
