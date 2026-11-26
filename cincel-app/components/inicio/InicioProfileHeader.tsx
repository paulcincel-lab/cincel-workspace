"use client";

import { useQuery } from "@tanstack/react-query";
import { AtSignIcon, GlobeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { avatarMenuLinks } from "@/components/shell/AvatarMenu";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { PageHeader } from "@/components/widgets/PageHeader";
import { initialsOf } from "@/lib/inicio/header";
import { meProfileOptions } from "@/lib/query/options/me";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";

import { ProfilePhotoButton } from "./ProfilePhotoButton";

export type InicioProfileHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Page actions ("Nueva tarea"); the company links come after them. */
  actions?: ReactNode;
  /** Initials source when `qk.me.profile()` has no name yet. */
  fallbackName: string;
};

const LINK_ICONS = { instagram: AtSignIcon, website: GlobeIcon } as const;

/**
 * Inicio header of every style (#1194): the viewer's photo
 * (`ProfilePhotoButton`, writes `qk.me.profile()` so the shell avatar updates
 * with it), the style's `PageHeader` and the company's Instagram / Sitio web
 * links from Ajustes › General, each hidden while its field is empty.
 */
export function InicioProfileHeader({ title, description, actions, fallbackName }: InicioProfileHeaderProps) {
  const profile = useQuery(meProfileOptions()).data;
  const { company } = useGeneralSettings();
  const links = avatarMenuLinks(company as Parameters<typeof avatarMenuLinks>[0]).filter(
    (link): link is typeof link & { key: keyof typeof LINK_ICONS } => link.key in LINK_ICONS,
  );

  return (
    <div data-slot="inicio-profile-header" className="flex flex-wrap items-start gap-4">
      <ProfilePhotoButton photoUrl={profile?.photoUrl ?? null} initials={initialsOf(profile?.name || fallbackName)} />
      <div className="min-w-0 flex-1">
        <PageHeader
          title={title}
          description={description}
          actions={
            <>
              {actions}
              {links.map((link) => {
                const Icon = LINK_ICONS[link.key];
                return (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${link.label}`}
                    title={link.label}
                    className={buttonVariants({ variant: "outline", size: "icon" })}
                  >
                    <Icon aria-hidden="true" />
                  </a>
                );
              })}
            </>
          }
        />
      </div>
    </div>
  );
}
