"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet";
import { invitePortalClientAction } from "@/lib/actions/portal-actions";
import type { PortalInvitableContact } from "@/lib/repositories/portal-contacts-repository";
import type { PortalActionError } from "@/lib/types/portal";

/** Server error codes → copy (FE §2.4). `socio_unconfirmed` shows the socio checkbox instead. */
export const PORTAL_ERROR_MESSAGES: Record<PortalActionError, string> = {
  staff_domain: "Este correo es de tu equipo; usa el acceso con Google.",
  disabled: "Este cliente está deshabilitado.",
  already_active: "Este cliente ya tiene acceso a este proyecto.",
  not_project_contact: "El contacto no pertenece a este proyecto.",
  socio_unconfirmed: "Confirma que entiendes que es un socio.",
  invalid_email: "Correo inválido.",
  rate_limited: "Ya reenviaste esta invitación varias veces; espera una hora.",
  forbidden: "No tienes permiso.",
  not_found: "No encontramos el proyecto o el contacto.",
};

export const INVITE_SENT_MESSAGE = "Invitación enviada";
export const INVITE_EMAIL_FAILED_MESSAGE = "Se dio acceso pero el correo no salió. Usa Reenviar invitación.";

/** How long the inline success stays before the sheet closes. */
const CLOSE_AFTER_MS = 1500;

const CONTACT_TYPE_LABEL: Record<PortalInvitableContact["type"], string> = { cliente: "Cliente", socio: "Socio" };

export type InvitePortalClientSheetProps = {
  projectId: string;
  contacts: PortalInvitableContact[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful invite, before the sheet closes. */
  onInvited?: () => void;
};

/** **Invitar cliente** drawer of the Clientes tab (FE §2.4). */
export function InvitePortalClientSheet({
  projectId,
  contacts,
  open,
  onOpenChange,
  onInvited,
}: InvitePortalClientSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [confirmSocio, setConfirmSocio] = useState(false);
  const [askSocio, setAskSocio] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contact = contacts.find((c) => c.id === contactId) ?? null;
  const isSocio = contact?.type === "socio" || askSocio;
  const canSubmit = Boolean(contact) && email.trim() !== "" && (!isSocio || confirmSocio) && !isPending && !success;

  useEffect(() => {
    if (!open) return;
    // A fresh form every time the sheet opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContactId("");
    setEmail("");
    setName("");
    setConfirmSocio(false);
    setAskSocio(false);
    setError("");
    setSuccess("");
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function pickContact(next: PortalInvitableContact) {
    setContactId(next.id);
    setEmail(next.email ?? "");
    setName(next.name);
    setConfirmSocio(false);
    setAskSocio(false);
    setError("");
    setPickerOpen(false);
  }

  function submit() {
    if (!contact) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await invitePortalClientAction({
          projectId,
          contactId: contact.id,
          email: email.trim(),
          name: name.trim(),
          ...(isSocio ? { confirmSocio } : {}),
        });
        if (!result.ok) {
          if (result.error === "socio_unconfirmed") {
            setAskSocio(true);
            setConfirmSocio(false);
          }
          setError(PORTAL_ERROR_MESSAGES[result.error]);
          return;
        }
        setSuccess(result.emailSent ? INVITE_SENT_MESSAGE : INVITE_EMAIL_FAILED_MESSAGE);
        onInvited?.();
        closeTimer.current = setTimeout(() => onOpenChange(false), CLOSE_AFTER_MS);
      } catch {
        setError("No se pudo enviar la invitación.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invitar cliente</SheetTitle>
          <SheetDescription>El cliente recibe un correo con un enlace para entrar al portal.</SheetDescription>
        </SheetHeader>

        <form
          id="invite-portal-client-form"
          className="space-y-4 px-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) submit();
          }}
        >
          {success ? (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label id="invite-portal-contact-label">Contacto</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    aria-labelledby="invite-portal-contact-label"
                  />
                }
              >
                <span className="truncate">{contact ? contact.name : "Elige un contacto"}</span>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0">
                <Command>
                  <CommandInput placeholder="Buscar contacto..." />
                  <CommandList>
                    <CommandEmpty>No hay contactos que coincidan.</CommandEmpty>
                    <CommandGroup>
                      {contacts.map((option) => (
                        <CommandItem
                          key={option.id}
                          value={`${option.name} ${option.id}`}
                          onSelect={() => pickContact(option)}
                        >
                          <span className="truncate">{option.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {CONTACT_TYPE_LABEL[option.type]}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Este proyecto no tiene contactos de tipo cliente o socio.
              </p>
            ) : null}
          </div>

          {isSocio ? (
            <Alert>
              <AlertTitle>Este contacto es un socio</AlertTitle>
              <AlertDescription>
                Un socio no es el cliente del proyecto, pero verá todo lo que pongas en 02 Cliente.
              </AlertDescription>
            </Alert>
          ) : null}
          {isSocio ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={confirmSocio} onCheckedChange={(checked) => setConfirmSocio(checked === true)} />
              Entiendo que es un socio, no el cliente
            </label>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="invite-portal-email">Correo</Label>
            <Input
              id="invite-portal-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-portal-name">Nombre</Label>
            <Input id="invite-portal-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        </form>

        <SheetFooter>
          <Button type="submit" form="invite-portal-client-form" disabled={!canSubmit}>
            {isPending ? "Enviando…" : "Enviar invitación"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
