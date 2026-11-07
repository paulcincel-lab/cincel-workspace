"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import {
  AtSignIcon,
  CameraIcon,
  GlobeIcon,
  LogOutIcon,
  MailIcon,
  PaletteIcon,
  Trash2Icon,
  Undo2Icon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { logoutAction } from "@/lib/auth/auth-actions";
import { updateMyPreferencesAction } from "@/lib/actions/preferences-actions";
import { IMPLEMENTED as PREFERENCES_IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import { removeMyPhotoAction } from "@/lib/actions/profile-photo-actions";
import { IMPLEMENTED as PHOTO_IMPLEMENTED } from "@/lib/actions/profile-photo-actions.flags";
import { actionErrorText } from "@/lib/errors";
import type { GeneralCompanySettings } from "@/lib/settings/general-settings";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import { useSessionStore } from "@/lib/stores/session-store";

import type { AppShellProps } from "./AppShell";
import { changeMyPhoto, PHOTO_ACCEPT } from "./photo-upload";

export type AvatarMenuProps = {
  session: AppShellProps["session"];
  /** Called with the new photo URL after an upload, or null after a removal. */
  onPhotoChange?(url: string | null): void;
};

export type AvatarMenuLink = { key: "instagram" | "website" | "email"; label: string; href: string };

/** Company fields the avatar menu reads (FE §3.1, §21.1 row 5); the new ones may still be absent. */
type CompanyLinkFields = Pick<GeneralCompanySettings, "website"> & { instagramUrl?: string; contactEmail?: string };

/** Instagram / Sitio web / Correo from General settings, skipping the empty ones. */
export function avatarMenuLinks(company: CompanyLinkFields): AvatarMenuLink[] {
  const links: AvatarMenuLink[] = [];
  const instagram = company.instagramUrl?.trim() ?? "";
  const website = company.website?.trim() ?? "";
  const email = company.contactEmail?.trim() ?? "";
  if (instagram) links.push({ key: "instagram", label: "Instagram", href: instagram });
  if (website) links.push({ key: "website", label: "Sitio web", href: website });
  if (email) links.push({ key: "email", label: "Correo", href: email.startsWith("mailto:") ? email : `mailto:${email}` });
  return links;
}

/** Up to two initials for the avatar fallback. */
export function nameInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [...words[0].slice(0, 2)];
  return letters.join("").toUpperCase();
}

const LINK_ICONS = { instagram: AtSignIcon, website: GlobeIcon, email: MailIcon } as const;

/**
 * Avatar menu of the new Sidebar user block (redesign FE §3.1, §2.3, §7.2,
 * §7.3): Perfil, Apariencia, the company contact links, photo upload / remove,
 * "Volver al diseño anterior" and "Cerrar sesión". Entry points backed by an
 * action stay hidden while its `IMPLEMENTED` flag is false.
 */
export function AvatarMenu({ session, onPhotoChange }: AvatarMenuProps) {
  const router = useRouter();
  const { company } = useGeneralSettings();
  const links = avatarMenuLinks(company as CompanyLinkFields);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(session.photoUrl);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const showPhotoItems = PHOTO_IMPLEMENTED.removeMyPhotoAction;
  const showGoBack = PREFERENCES_IMPLEMENTED.updateMyPreferencesAction;
  const initials = nameInitials(session.name);

  function applyPhoto(url: string | null) {
    setPhotoUrl(url);
    onPhotoChange?.(url);
    startTransition(() => router.refresh());
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      applyPhoto(await changeMyPhoto(file));
      toast.success("Foto actualizada.");
    } catch (err) {
      toast.error(actionErrorText(err, "photo"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePhoto() {
    setBusy(true);
    try {
      await removeMyPhotoAction();
      applyPhoto(null);
      toast.success("Foto eliminada.");
    } catch (err) {
      toast.error(actionErrorText(err, "photo"));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoBack() {
    try {
      await updateMyPreferencesAction({ redesignEnabled: false });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(actionErrorText(err));
    }
  }

  async function handleSignOut() {
    try {
      await logoutAction();
      useSessionStore.getState().setAccess({ status: "guest", user: null });
      router.push("/login");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(actionErrorText(err));
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={`Menú de la cuenta de ${session.name}`} />}
        >
          <Avatar data-photo={photoUrl ? "photo" : "initials"}>
            {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{session.name}</DropdownMenuLabel>
            <DropdownMenuItem render={<Link href="/ajustes/perfil" />}>
              <UserIcon aria-hidden="true" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/ajustes/apariencia" />}>
              <PaletteIcon aria-hidden="true" />
              Apariencia
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {links.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {links.map((link) => {
                  const Icon = LINK_ICONS[link.key];
                  const external = link.key !== "email";
                  return (
                    <DropdownMenuItem
                      key={link.key}
                      render={
                        <a href={link.href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} />
                      }
                    >
                      <Icon aria-hidden="true" />
                      {link.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </>
          ) : null}
          {showPhotoItems ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={busy} onClick={() => fileInput.current?.click()}>
                  <CameraIcon aria-hidden="true" />
                  {photoUrl ? "Cambiar foto" : "Subir foto"}
                </DropdownMenuItem>
                {photoUrl ? (
                  <DropdownMenuItem disabled={busy} onClick={() => void handleRemovePhoto()}>
                    <Trash2Icon aria-hidden="true" />
                    Quitar foto
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {showGoBack ? (
              <DropdownMenuItem onClick={() => void handleGoBack()}>
                <Undo2Icon aria-hidden="true" />
                Volver al diseño anterior
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem variant="destructive" onClick={() => void handleSignOut()}>
              <LogOutIcon aria-hidden="true" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {showPhotoItems ? (
        <input
          ref={fileInput}
          type="file"
          accept={PHOTO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Elegir foto de perfil"
          onChange={(event) => void handleFile(event)}
        />
      ) : null}
    </>
  );
}
