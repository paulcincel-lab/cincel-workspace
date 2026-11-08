"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { InvitePortalClientSheet, portalErrorText } from "@/components/proyectos/InvitePortalClientSheet";
import { PortalActivityCard } from "@/components/proyectos/PortalActivityCard";
import { PortalClientFolderHint } from "@/components/proyectos/PortalClientFolderHint";
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
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { clientesAccessKeys, isClientesQuery } from "@/lib/query/options/proyectos-archivos-clientes";
import type { PortalInvitableContact } from "@/lib/repositories/portal-contacts-repository";
import type { PortalAccessRow, PortalAccessStatus, PortalMutationResult, ResendPortalInviteResult } from "@/lib/types/portal";

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

const ACTION_FAILED = "No se pudo completar la acción.";

/** The panel shows every error inline (its notice), never as a toast. */
const INLINE_ERRORS = { onFormError: () => undefined } as const;

type Ok<R> = Extract<R, { ok: true }>;

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
  /** The project has a client. Without one, inviting and the client folder wait (FE §3.5 portal gating). */
  hasClient?: boolean;
  /** Administrators get a link to the ficha to assign the client. */
  canAssignClient?: boolean;
};

export const PORTAL_NO_CLIENT_TEXT = "Asigna un cliente al proyecto para invitarlo al portal y crear su carpeta.";

/** Shown instead of the invite sheet and the folder hint while the project has no client. */
export function PortalNoClientAlert({ projectId, canAssignClient }: { projectId: string; canAssignClient: boolean }) {
  return (
    <Alert>
      <Info />
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{PORTAL_NO_CLIENT_TEXT}</span>
        {canAssignClient ? (
          <Link href={`/proyectos/${projectId}/ficha`} className="underline">
            Asignar cliente
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Clientes tab body (FE §2.4): Drive hint, access table with row actions,
 * Invitar cliente and the Actividad card. Every action is a
 * `useActionMutation` (Query Migration 5d, #962): an error shows its copy and
 * keeps the panel as it is (no refetch); a success invalidates only the keys
 * it changed. Resend touches nothing but the activity.
 */
export function PortalAccessPanel({
  projectId,
  projectName,
  rows,
  contacts,
  capabilities,
  hasClient = true,
  canAssignClient = false,
}: PortalAccessPanelProps) {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Each invalidation runs only after a success (`data` is undefined after an error).
  const resendMutation = useActionMutation<PortalAccessRow, Ok<ResendPortalInviteResult>>(
    (row) => resendPortalInviteAction(row.portalUserId, projectId),
    { ...INLINE_ERRORS, invalidate: (_row, data) => (data ? [qk.proyectos.clientesActivity(projectId)] : []) },
  );
  const revokeMutation = useActionMutation<PortalAccessRow, Ok<PortalMutationResult>>(
    (row) => revokePortalAccessAction(row.accessId),
    { ...INLINE_ERRORS, invalidate: (_row, data) => (data ? clientesAccessKeys(projectId) : []) },
  );
  // Disable and enable act on the portal user, so every project's Clientes keys go stale
  // (a predicate, so it runs in `setData`, the hook's success-only cache step).
  const allClientes = () => void qc.invalidateQueries({ predicate: isClientesQuery });
  const disableMutation = useActionMutation<PortalAccessRow, Ok<PortalMutationResult>>(
    (row) => disablePortalUserAction(row.portalUserId),
    { ...INLINE_ERRORS, setData: allClientes },
  );
  const enableMutation = useActionMutation<PortalAccessRow, Ok<PortalMutationResult>>(
    (row) => enablePortalUserAction(row.portalUserId),
    { ...INLINE_ERRORS, setData: allClientes },
  );
  const isPending =
    resendMutation.isPending || revokeMutation.isPending || disableMutation.isPending || enableMutation.isPending;

  /** Runs one row action: the notice says how it went; an error leaves rows and dialogs as they are. */
  function run<R>(
    mutation: UseMutationResult<R, Error, PortalAccessRow, unknown>,
    row: PortalAccessRow,
    done: (data: R) => Notice,
  ) {
    setNotice(null);
    mutation.mutate(row, {
      onSuccess: (data) => setNotice(done(data)),
      onError: (err) => setNotice({ kind: "error", message: portalErrorText(err, ACTION_FAILED) }),
    });
  }

  function resend(row: PortalAccessRow) {
    run(resendMutation, row, (result) =>
      result.emailSent
        ? { kind: "ok", message: `Invitación reenviada a ${row.email}.` }
        : { kind: "error", message: "No se pudo enviar el correo. Intenta de nuevo más tarde." },
    );
  }

  function enable(row: PortalAccessRow) {
    run(enableMutation, row, () => ({ kind: "ok", message: `${row.name} está habilitado de nuevo.` }));
  }

  function confirmAction() {
    const target = confirm;
    if (!target) return;
    setConfirm(null);
    if (target.kind === "revoke") {
      run(revokeMutation, target.row, () => ({
        kind: "ok",
        message: `${target.row.name} ya no tiene acceso a este proyecto.`,
      }));
    } else {
      run(disableMutation, target.row, () => ({ kind: "ok", message: `${target.row.name} está deshabilitado.` }));
    }
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
          {/* Under `ProjectTabs` (FE §3.5) the project header owns the page title. */}
          <h2 className="text-lg font-semibold text-foreground">Clientes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Clientes con acceso al portal para {projectName}.</p>
        </div>
        {hasClient ? <Button onClick={() => setInviteOpen(true)}>Invitar cliente</Button> : null}
      </div>

      {hasClient ? (
        <PortalClientFolderHint projectId={projectId} />
      ) : (
        <PortalNoClientAlert projectId={projectId} canAssignClient={canAssignClient} />
      )}

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

      <PortalActivityCard projectId={projectId} />

      {hasClient ? (
        <InvitePortalClientSheet
          projectId={projectId}
          contacts={contacts}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      ) : null}

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
