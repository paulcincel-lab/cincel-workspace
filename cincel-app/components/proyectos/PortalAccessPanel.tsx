"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { InvitePortalClientSheet, PORTAL_ERROR_MESSAGES } from "@/components/proyectos/InvitePortalClientSheet";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { RowActionsMenu, type RowAction } from "@/components/v2/table/RowActionsMenu";
import {
  disablePortalUserAction,
  enablePortalUserAction,
  resendPortalInviteAction,
  revokePortalAccessAction,
} from "@/lib/actions/portal-actions";
import type { PortalCapabilities } from "@/lib/auth/permissions";
import type { PortalInvitableContact } from "@/lib/repositories/portal-contacts-repository";
import type { PortalAccessRow, PortalAccessStatus } from "@/lib/types/portal";

const STATUS_LABEL: Record<PortalAccessStatus, string> = {
  invited: "Invitado",
  active: "Activo",
  disabled: "Deshabilitado",
  revoked: "Sin acceso",
};

const STATUS_VARIANT: Record<PortalAccessStatus, "default" | "secondary" | "outline"> = {
  invited: "secondary",
  active: "default",
  disabled: "outline",
  revoked: "outline",
};

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

type Confirm = { kind: "revoke" | "disable"; row: PortalAccessRow };

type Notice = { kind: "ok" | "error"; message: string };

/** Row actions by status and capability (FE §2.4). Revoked rows have none; invite again from the sheet. */
export function portalRowActions(
  row: PortalAccessRow,
  capabilities: PortalCapabilities,
  handlers: {
    resend: (row: PortalAccessRow) => void;
    revoke: (row: PortalAccessRow) => void;
    disable: (row: PortalAccessRow) => void;
    enable: (row: PortalAccessRow) => void;
  },
): RowAction<PortalAccessRow>[] {
  if (row.status === "revoked") return [];
  const actions: RowAction<PortalAccessRow>[] = [];
  if (capabilities.manageAccess && row.status !== "disabled") {
    actions.push({ label: "Reenviar invitación", onSelect: handlers.resend });
  }
  if (capabilities.disableUsers && row.status === "disabled") {
    actions.push({ label: "Habilitar", onSelect: handlers.enable });
  }
  if (capabilities.manageAccess) {
    actions.push({ label: "Quitar acceso", variant: "destructive", separatorBefore: true, onSelect: handlers.revoke });
  }
  if (capabilities.disableUsers && row.status !== "disabled") {
    actions.push({ label: "Deshabilitar", variant: "destructive", onSelect: handlers.disable });
  }
  return actions;
}

export type PortalAccessPanelProps = {
  projectId: string;
  projectName: string;
  rows: PortalAccessRow[];
  contacts: PortalInvitableContact[];
  capabilities: PortalCapabilities;
};

/** Clientes tab body (FE §2.4): Drive hint, access table with row actions, Invitar cliente and the Actividad card. */
export function PortalAccessPanel({
  projectId,
  projectName,
  rows,
  contacts,
  capabilities,
}: PortalAccessPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function run(task: () => Promise<Notice | null>) {
    setNotice(null);
    startTransition(async () => {
      try {
        const next = await task();
        setNotice(next);
      } catch {
        setNotice({ kind: "error", message: "No se pudo completar la acción." });
      }
      router.refresh();
    });
  }

  function resend(row: PortalAccessRow) {
    run(async () => {
      const result = await resendPortalInviteAction(row.portalUserId, projectId);
      if (!result.ok) return { kind: "error", message: PORTAL_ERROR_MESSAGES[result.error] };
      return result.emailSent
        ? { kind: "ok", message: `Invitación reenviada a ${row.email}.` }
        : { kind: "error", message: "No se pudo enviar el correo. Intenta de nuevo más tarde." };
    });
  }

  function enable(row: PortalAccessRow) {
    run(async () => {
      const result = await enablePortalUserAction(row.portalUserId);
      if (!result.ok) return { kind: "error", message: PORTAL_ERROR_MESSAGES[result.error] };
      return { kind: "ok", message: `${row.name} está habilitado de nuevo.` };
    });
  }

  function confirmAction() {
    const target = confirm;
    if (!target) return;
    setConfirm(null);
    run(async () => {
      const result =
        target.kind === "revoke"
          ? await revokePortalAccessAction(target.row.accessId)
          : await disablePortalUserAction(target.row.portalUserId);
      if (!result.ok) return { kind: "error", message: PORTAL_ERROR_MESSAGES[result.error] };
      return {
        kind: "ok",
        message:
          target.kind === "revoke"
            ? `${target.row.name} ya no tiene acceso a este proyecto.`
            : `${target.row.name} está deshabilitado.`,
      };
    });
  }

  const columns = useMemo<ColumnDef<PortalAccessRow, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Nombre" },
      { accessorKey: "email", header: "Correo" },
      { id: "contact", header: "Contacto", cell: ({ row }) => row.original.contact.name },
      {
        id: "status",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>
        ),
      },
      { accessorKey: "invitedBy", header: "Invitado por" },
      { id: "lastLoginAt", header: "Último acceso", cell: ({ row }) => formatDateTime(row.original.lastLoginAt) },
      {
        id: "actions",
        header: "",
        size: 36,
        cell: ({ row }) => {
          const actions = portalRowActions(row.original, capabilities, {
            resend,
            enable,
            revoke: (target) => setConfirm({ kind: "revoke", row: target }),
            disable: (target) => setConfirm({ kind: "disable", row: target }),
          });
          return actions.length > 0 ? <RowActionsMenu row={row.original} actions={actions} /> : null;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capabilities, projectId],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clientes con acceso al portal para {projectName}.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Invitar cliente</Button>
      </div>

      {notice ? (
        <Alert variant={notice.kind === "error" ? "destructive" : "default"} aria-live="polite">
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.accessId}
        emptyMessage="Aún no hay clientes invitados a este proyecto."
      />

      <InvitePortalClientSheet
        projectId={projectId}
        contacts={contacts}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => router.refresh()}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(next) => (next ? undefined : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "disable" ? "¿Deshabilitar a este cliente?" : "¿Quitar el acceso a este proyecto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "disable"
                ? `${confirm.row.name} saldrá del portal en todos sus proyectos y no podrá volver a entrar.`
                : confirm
                  ? `${confirm.row.name} dejará de ver ${projectName} en el portal.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirmAction}>
              {confirm?.kind === "disable" ? "Deshabilitar" : "Quitar acceso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
