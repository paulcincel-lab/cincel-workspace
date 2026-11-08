"use client";

import { useGeneralSettingsEditorContext } from "@/components/ajustes/general-settings-editor-context";
import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Input } from "@/components/ui/shadcn/input";
import type { HeaderLinkFields } from "@/lib/settings/header-links";

type LinkField = keyof HeaderLinkFields;

const FIELDS: readonly { key: LinkField; label: string; description: string; type: "url" | "email"; placeholder: string }[] = [
  {
    key: "website",
    label: "Sitio web",
    description: "Dirección completa, empieza con https://.",
    type: "url",
    placeholder: "https://www.cincel.mx",
  },
  {
    key: "instagramUrl",
    label: "Instagram",
    description: "Enlace al perfil, empieza con https://.",
    type: "url",
    placeholder: "https://www.instagram.com/cincel.mx",
  },
  {
    key: "contactEmail",
    label: "Correo",
    description: "Correo de contacto del despacho.",
    type: "email",
    placeholder: "contacto@cincel.mx",
  },
];

/**
 * "Enlaces del despacho" of Ajustes › General (redesign FE §3.8, BE §3.12):
 * Sitio web, Instagram and Correo, saved in `general_settings.company` and
 * read by the avatar menu. An empty field hides its link. Edits the page's
 * shared editor, so the page's "Guardar cambios" saves them.
 */
export function GeneralLinksSection() {
  const { settings, canManage, linkErrors, updateCompanyField } = useGeneralSettingsEditorContext();

  return (
    <SettingsSection title="Enlaces del despacho" description="Aparecen en el menú de tu perfil, para todo el equipo.">
      {FIELDS.map(({ key, label, description, type, placeholder }) => {
        const id = `general-${key}`;
        const errorId = `${id}-error`;
        const fieldError = linkErrors[key];
        return (
          <SettingsRow
            key={key}
            label={label}
            description={description}
            htmlFor={id}
            control={
              <div className="flex flex-col gap-1">
                <Input
                  id={id}
                  type={type}
                  inputMode={type}
                  placeholder={placeholder}
                  value={settings.company[key] ?? ""}
                  disabled={!canManage}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? errorId : undefined}
                  onChange={(event) => updateCompanyField(key, event.target.value)}
                />
                {fieldError ? (
                  <p id={errorId} className="text-xs text-destructive">
                    {fieldError}
                  </p>
                ) : null}
              </div>
            }
          />
        );
      })}
    </SettingsSection>
  );
}
