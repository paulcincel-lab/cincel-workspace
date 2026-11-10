"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { generalLinkErrors } from "@/components/configuracion/use-general-settings-editor";
import { errorId as fieldErrorId, Field, hintId } from "@/components/ajustes/AdminFields";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Input } from "@/components/ui/shadcn/input";
import { ajustesGeneralOptions } from "@/lib/query/options/ajustes";
import type { HeaderLinkFields } from "@/lib/settings/header-links";
import { useGeneralForm } from "@/lib/stores/ajustes/general-form-store";

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
 * read by the avatar menu (canvas `Ajustes-General`: label, field, hint and
 * the inline error). An empty field hides its link. Edits the page's
 * draft store (`GeneralFormStoreProvider`), so the page's "Guardar cambios"
 * saves them.
 */
export function GeneralLinksSection() {
  const { canManage } = useSuspenseQuery(ajustesGeneralOptions()).data;
  const settings = useGeneralForm((s) => s.settings);
  const updateCompanyField = useGeneralForm((s) => s.setCompanyField);
  const linkErrors = generalLinkErrors(settings, true);

  return (
    <SettingsSection
      title="Enlaces del despacho"
      description="Aparecen en el menú de tu perfil, para todo el equipo."
      level={3}
    >
      <div className="flex flex-col gap-3.5">
        {FIELDS.map(({ key, label, description, type, placeholder }) => {
          const id = `general-${key}`;
          const fieldError = linkErrors[key];
          return (
            <Field key={key} htmlFor={id} label={label} hint={description} error={fieldError}>
              <Input
                id={id}
                type={type}
                inputMode={type}
                placeholder={placeholder}
                className="h-9"
                value={settings.company[key] ?? ""}
                disabled={!canManage}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${fieldErrorId(id)} ${hintId(id)}` : hintId(id)}
                onChange={(event) => updateCompanyField(key, event.target.value)}
              />
            </Field>
          );
        })}
      </div>
    </SettingsSection>
  );
}
