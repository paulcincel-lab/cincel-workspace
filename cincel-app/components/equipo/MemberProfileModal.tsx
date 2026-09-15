"use client";

import { useEffect, useState } from "react";

import AppAvatar from "@/components/ui/AppAvatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { StaffSensitiveInfo, TeamMemberWithWorkload } from "@/lib/equipo/types";

interface MemberProfileModalProps {
  member: TeamMemberWithWorkload;
  onClose: () => void;
}

/**
 * Read-only personal profile overlay. PII fields load on demand from the
 * authenticated /api/team/sensitive/[id] route — they never ship in the bulk
 * staff list.
 */
export function MemberProfileModal({ member, onClose }: MemberProfileModalProps) {
  const [sensitive, setSensitive] = useState<StaffSensitiveInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/team/sensitive/${member.id}`)
      .then((res) => (res.ok ? (res.json() as Promise<StaffSensitiveInfo>) : null))
      .then((data) => {
        if (!cancelled) setSensitive(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [member.id]);

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
            <p><span className="font-medium">Celular:</span> {member.phone || "-"}</p>
            <p><span className="font-medium">Correo institucional:</span> {member.institutionalEmail || "-"}</p>
            <p><span className="font-medium">Puesto:</span> {member.role}</p>
            <p><span className="font-medium">Área:</span> {member.area}</p>
            {sensitive ? (
              <>
                <p><span className="font-medium">Fecha nacimiento:</span> {sensitive.birth_date || "-"}</p>
                <p><span className="font-medium">Nacionalidad:</span> {sensitive.nationality || "-"}</p>
                <p><span className="font-medium">Dirección:</span> {sensitive.address || "-"}</p>
                <p><span className="font-medium">Estado civil:</span> {sensitive.marital_status || "-"}</p>
                <p><span className="font-medium">Teléfono de casa:</span> {sensitive.home_phone || "-"}</p>
                <p><span className="font-medium">Correo personal:</span> {sensitive.personal_email || "-"}</p>
                <p><span className="font-medium">CURP:</span> {sensitive.curp || "-"}</p>
                <p><span className="font-medium">RFC:</span> {sensitive.rfc || "-"}</p>
              </>
            ) : (
              <p className="col-span-2 text-muted-foreground">Cargando datos personales…</p>
            )}
          </div>

          {sensitive?.emergency_contact ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
              <p className="font-medium">Contacto de emergencia</p>
              <p className="mt-1"><span className="font-medium">Nombre:</span> {sensitive.emergency_contact.name || "-"}</p>
              <p className="mt-1"><span className="font-medium">Relación:</span> {sensitive.emergency_contact.relation || "-"}</p>
              <p className="mt-1"><span className="font-medium">Teléfono:</span> {sensitive.emergency_contact.phone || "-"}</p>
              <p className="mt-1"><span className="font-medium">Dirección:</span> {sensitive.emergency_contact.address || "-"}</p>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-muted p-4 text-sm text-foreground">
            <p className="font-medium">Carga actual</p>
            <p className="mt-1">Asignadas: {member.assigned} | Soporte: {member.support} | Total: {member.total}</p>
            <p className="mt-1">Ocupación: {member.occupancy}%</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
