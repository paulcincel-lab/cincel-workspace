"use client";

import AppAvatar from "@/components/ui/AppAvatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { TeamMemberWithWorkload } from "@/lib/equipo/types";

interface MemberProfileModalProps {
  member: TeamMemberWithWorkload;
  onClose: () => void;
}

/** Read-only personal profile overlay for a team member. */
export function MemberProfileModal({ member, onClose }: MemberProfileModalProps) {
  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ficha personal</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <AppAvatar name={member.name} />
            <Badge variant={member.active ? "outline" : "secondary"}>
              {member.active ? "Activo" : "Desactivado"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-foreground">
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

          <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
            <p className="font-medium">Contacto de emergencia</p>
            <p className="mt-1"><span className="font-medium">Nombre:</span> {member.emergencyContact.name || "-"}</p>
            <p className="mt-1"><span className="font-medium">Relacion:</span> {member.emergencyContact.relation || "-"}</p>
            <p className="mt-1"><span className="font-medium">Telefono:</span> {member.emergencyContact.phone || "-"}</p>
            <p className="mt-1"><span className="font-medium">Direccion:</span> {member.emergencyContact.address || "-"}</p>
          </div>

          <div className="rounded-xl border border-border bg-muted p-4 text-sm text-foreground">
            <p className="font-medium">Carga actual</p>
            <p className="mt-1">Asignadas: {member.assigned} | Soporte: {member.support} | Total: {member.total}</p>
            <p className="mt-1">Ocupacion: {member.occupancy}%</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
