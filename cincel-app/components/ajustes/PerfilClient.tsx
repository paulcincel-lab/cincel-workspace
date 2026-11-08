"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { usePhotoUploadMutation, useRemovePhotoMutation } from "@/components/shell/photo-upload";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { IMPLEMENTED as PHOTO_IMPLEMENTED } from "@/lib/actions/profile-photo-actions.flags";
import { unwrapActionResult } from "@/lib/actions/action-result";
import { updateStaffAction, upsertStaffProfileAction } from "@/lib/actions/staff-actions";
import { changePasswordAction } from "@/lib/auth/auth-actions";
import { actionErrorText } from "@/lib/errors";
import { reencodePhoto, uploadMyPhoto } from "@/lib/profile-photo/reencode";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { meProfileOptions } from "@/lib/query/options/me";
import { ajustesPerfilOptions, type AjustesPerfilPageData } from "@/lib/query/options/ajustes";
import {
  PerfilFormStoreProvider,
  perfilDraftOf,
  usePerfilForm,
  usePerfilFormApi,
  type PerfilDraft,
} from "@/lib/stores/ajustes/perfil-form-store";
import type { PerfilData, WeekHours } from "@/lib/types/redesign";
import { isGoogleManagedRefusal } from "@/lib/types/workspace-access";

export type { PerfilData } from "@/lib/types/redesign";

// ── Copy (redesign FE §3.8, §9, §13) ────────────────────────────────────────

export const PERFIL_LANGUAGE_LABEL = "Español (México)";
export const PERFIL_TIME_ZONE_LABEL = "Ciudad de México (America/Mexico_City)";
export const PHOTO_HINT = "JPG, PNG o WebP, hasta 2 MB.";
export const PUESTO_HINT = "Lo asigna un administrador en Equipo.";
export const CORREO_HINT = "Viene de tu cuenta de Google; no se puede cambiar aquí.";
export const REGION_HINT = "Cincel usa español de México y la hora de Ciudad de México.";
export const NAME_REQUIRED_COPY = "Escribe tu nombre.";

const hoursFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** "32.5 h de 40 h" (or "6 h" when there is no target this week). */
export function formatWeekHoursLine(week: WeekHours): string {
  const total = `${hoursFormat.format(week.total)} h`;
  return week.target > 0 ? `${total} de ${hoursFormat.format(week.target)} h` : total;
}

/** Up to two initials for the avatar fallback. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

// ── Page state ──────────────────────────────────────────────────────────────

/** The hydrated `qk.ajustes.page('perfil')`: the caller's own profile. */
function usePerfilData(): PerfilData {
  return useSuspenseQuery(ajustesPerfilOptions()).data.profile;
}

export type PerfilClientProps = { children: ReactNode };

/**
 * Ajustes › Perfil (redesign FE §3.8): the sections registered in
 * `lib/shell/settings-sections/perfil/*` read the hydrated
 * `qk.ajustes.page('perfil')` (and the photo from `qk.me.profile()`); the
 * datos form draft lives in a page-scoped store, reset when the page
 * unmounts.
 */
export function PerfilClient({ children }: PerfilClientProps) {
  const profile = usePerfilData();
  return (
    <PerfilFormStoreProvider initial={perfilDraftOf(profile)}>
      <div className="flex flex-col gap-4">{children}</div>
    </PerfilFormStoreProvider>
  );
}

// ── Foto de perfil ──────────────────────────────────────────────────────────

/** Re-encode then POST: Perfil's own upload pipeline. */
async function uploadPerfilPhoto(file: File): Promise<string> {
  return uploadMyPhoto(await reencodePhoto(file));
}

/**
 * Photo: re-encoded on the client, uploaded to the photo route; "Quitar"
 * removes it. Both write `qk.me.profile()` (`setQueryData`), so the shell
 * avatar, Inicio and this card follow without a refresh.
 */
export function PerfilFoto() {
  const { name } = usePerfilData();
  const photoUrl = useQuery(meProfileOptions()).data?.photoUrl ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const [error, setError] = useState<string | null>(null);
  const uploadPhoto = usePhotoUploadMutation(uploadPerfilPhoto);
  const removePhoto = useRemovePhotoMutation();
  const pending = uploadPhoto.isPending ? "upload" : removePhoto.isPending ? "remove" : null;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    uploadPhoto.mutate(file, {
      onSuccess: () => toast.success("Foto actualizada"),
      onError: (err) => setError(actionErrorText(err, "photo")),
      onSettled: () => {
        if (inputRef.current) inputRef.current.value = "";
      },
    });
  };

  const onRemove = () => {
    setError(null);
    removePhoto.mutate(undefined, {
      onSuccess: () => toast.success("Foto quitada"),
      onError: (err) => setError(actionErrorText(err, "photo")),
    });
  };

  return (
    <SettingsSection title="Foto de perfil">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar size="lg">
          {photoUrl ? <AvatarImage src={photoUrl} alt="Tu foto de perfil" /> : null}
          <AvatarFallback>{initialsOf(name)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Elegir una foto"
              aria-describedby={hintId}
              tabIndex={-1}
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <Button type="button" disabled={pending !== null} onClick={() => inputRef.current?.click()} aria-describedby={hintId}>
              {pending === "upload" ? "Subiendo…" : "Cambiar foto"}
            </Button>
            {photoUrl && PHOTO_IMPLEMENTED.removeMyPhotoAction ? (
              <Button type="button" variant="destructive" disabled={pending !== null} onClick={onRemove}>
                {pending === "remove" ? "Quitando…" : "Quitar"}
              </Button>
            ) : null}
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {PHOTO_HINT}
          </p>
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </SettingsSection>
  );
}

// ── Datos personales, firma, idioma y región ────────────────────────────────

type PerfilSaveVars = { staffId: string; staff: { name: string; phone: string | null } | null; emailSignature: string | null | undefined };

/** The saved fields after a profile save (only the parts that were sent). */
type PerfilSaveResult = Partial<PerfilDraft>;

/**
 * One profile save: `updateStaffAction` when nombre or teléfono changed,
 * `upsertStaffProfileAction` when the firma changed (two POSTs at most).
 * Throws the action's error code; a Google-managed refusal is `FORBIDDEN`.
 */
async function savePerfil(vars: PerfilSaveVars): Promise<PerfilSaveResult> {
  const saved: PerfilSaveResult = {};
  if (vars.staff) {
    const updated = await updateStaffAction(vars.staffId, vars.staff);
    if (isGoogleManagedRefusal(updated)) throw new Error("FORBIDDEN");
    const row = unwrapActionResult(updated);
    saved.name = row.name;
    saved.phone = row.phone ?? "";
  }
  if (vars.emailSignature !== undefined) {
    const profile = unwrapActionResult(await upsertStaffProfileAction(vars.staffId, { emailSignature: vars.emailSignature }));
    saved.emailSignature = profile.emailSignature ?? "";
  }
  return saved;
}

/** Editable nombre, teléfono and firma; read-only puesto, correo, idioma and zona horaria. */
export function PerfilDatos() {
  const data = usePerfilData();
  const form = usePerfilFormApi();
  const name = usePerfilForm((s) => s.draft.name);
  const phone = usePerfilForm((s) => s.draft.phone);
  const signature = usePerfilForm((s) => s.draft.emailSignature);
  const nameError = usePerfilForm((s) => s.errors.name ?? null);
  const error = usePerfilForm((s) => s.formError);
  const setField = usePerfilForm((s) => s.setField);
  const ids = {
    name: useId(),
    nameError: useId(),
    puesto: useId(),
    email: useId(),
    phone: useId(),
    signature: useId(),
    language: useId(),
    timeZone: useId(),
  };

  const save = useActionMutation(savePerfil, {
    setData: (qc, saved) =>
      qc.setQueryData<AjustesPerfilPageData>(qk.ajustes.page("perfil"), (current) =>
        current ? { profile: { ...current.profile, ...saved } } : current,
      ),
    // The name and phone show in the shell, Equipo and pickers; the firma only on the person's detail.
    invalidate: (vars) =>
      vars.staff
        ? [qk.me.profile(), qk.personas.equipo(), qk.personas.detail(vars.staffId), qk.catalog.staff()]
        : [qk.personas.detail(vars.staffId)],
    successToast: "Perfil guardado",
    onFormError: (text) => form.getState().setFormError(text),
  });
  const isPending = save.isPending;

  const staffChanged = name.trim() !== data.name || phone.trim() !== data.phone;
  const signatureChanged = signature.trim() !== data.emailSignature.trim();
  const dirty = staffChanged || signatureChanged;

  const onCancel = () => form.getState().reset();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const state = form.getState();
    state.setFormError(null);
    if (!name.trim()) {
      state.setFieldError("name", NAME_REQUIRED_COPY);
      return;
    }
    state.setFieldError("name", null);
    save.mutate(
      {
        staffId: data.staffId,
        staff: staffChanged ? { name: name.trim(), phone: phone.trim() || null } : null,
        emailSignature: signatureChanged ? signature.trim() || null : undefined,
      },
      {
        onSuccess: (saved) =>
          form.getState().commit({
            name: saved.name ?? data.name,
            phone: saved.phone ?? data.phone,
            emailSignature: saved.emailSignature ?? data.emailSignature,
          }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <SettingsSection title="Datos personales">
        <SettingsRow
          label="Nombre"
          htmlFor={ids.name}
          control={
            <div className="flex flex-col gap-1">
              <Input
                id={ids.name}
                value={name}
                onChange={(event) => setField("name", event.target.value)}
                autoComplete="name"
                maxLength={120}
                required
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? ids.nameError : undefined}
              />
              {nameError ? (
                <p id={ids.nameError} className="text-xs text-destructive">
                  {nameError}
                </p>
              ) : null}
            </div>
          }
        />
        <SettingsRow
          label="Puesto"
          description={PUESTO_HINT}
          htmlFor={ids.puesto}
          control={<Input id={ids.puesto} value={data.puesto || "Sin puesto"} readOnly />}
        />
        <SettingsRow
          label="Correo"
          description={CORREO_HINT}
          htmlFor={ids.email}
          control={<Input id={ids.email} type="email" value={data.email} readOnly />}
        />
        <SettingsRow
          label="Teléfono"
          htmlFor={ids.phone}
          control={
            <Input
              id={ids.phone}
              type="tel"
              value={phone}
              onChange={(event) => setField("phone", event.target.value)}
              autoComplete="tel"
              maxLength={40}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Firma">
        <SettingsRow
          label="Firma de correo"
          htmlFor={ids.signature}
          control={
            <Textarea
              id={ids.signature}
              rows={4}
              value={signature}
              onChange={(event) => setField("emailSignature", event.target.value)}
              maxLength={2000}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Idioma y región" description={REGION_HINT}>
        <SettingsRow
          label="Idioma"
          htmlFor={ids.language}
          control={<Input id={ids.language} value={PERFIL_LANGUAGE_LABEL} readOnly />}
        />
        <SettingsRow
          label="Zona horaria"
          htmlFor={ids.timeZone}
          control={<Input id={ids.timeZone} value={PERFIL_TIME_ZONE_LABEL} readOnly />}
        />
      </SettingsSection>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={!dirty || isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!dirty || isPending}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

// ── Mis horas esta semana ───────────────────────────────────────────────────

/** One line with this week's hours; absent unless time tracking is enabled. */
export function PerfilHorasSemana() {
  const { week } = usePerfilData();
  if (!week) return null;
  return (
    <SettingsSection title="Mis horas esta semana">
      <p className="text-sm text-foreground">{formatWeekHoursLine(week)}</p>
    </SettingsSection>
  );
}

// ── Cambiar contraseña ──────────────────────────────────────────────────────

type PasswordDraft = { currentPassword: string; nextPassword: string; confirmPassword: string };

const EMPTY_PASSWORD_DRAFT: PasswordDraft = { currentPassword: "", nextPassword: "", confirmPassword: "" };

/** Same copy as the existing `/profile` form for every `changePasswordAction` reason. */
export function passwordChangeErrorText(reason: string): string {
  switch (reason) {
    case "password_login_disabled":
      return "El acceso con contraseña está desactivado. Entra con Google.";
    case "invalid_current_password":
      return "La contraseña actual no es correcta.";
    case "password_too_short":
      return "La nueva contraseña debe tener al menos 8 caracteres.";
    case "password_confirmation_mismatch":
      return "La confirmación no coincide con la nueva contraseña.";
    case "no_session":
      return "Tu sesión expiró. Inicia sesión de nuevo.";
    default:
      return "No fue posible actualizar la contraseña.";
  }
}

/** The existing password change (`changePasswordAction`), in the settings layout. */
/** `changePasswordAction` with one object argument, for the mutation. */
function changePassword(draft: PasswordDraft) {
  return changePasswordAction(draft.currentPassword, draft.nextPassword, draft.confirmPassword);
}

export function PerfilContrasena() {
  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // No cache effect: the password is not shown anywhere.
  const change = useActionMutation(changePassword, { onFormError: (text) => setError(text) });
  const isPending = change.isPending;
  const ids = {
    current: useId(),
    currentHelp: useId(),
    next: useId(),
    nextHelp: useId(),
    confirm: useId(),
    confirmHelp: useId(),
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    change.mutate(draft, {
      onSuccess: (result) => {
        if (!result.ok) {
          setError(passwordChangeErrorText(result.reason));
          return;
        }
        setSuccess("Contraseña actualizada correctamente.");
        setDraft(EMPTY_PASSWORD_DRAFT);
      },
    });
  };

  return (
    <SettingsSection title="Cambiar contraseña" description="Actualiza tu contraseña sin cerrar sesión.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <SettingsRow
          label="Contraseña actual"
          htmlFor={ids.current}
          control={
            <div className="flex flex-col gap-1">
              <Input
                id={ids.current}
                type="password"
                autoComplete="current-password"
                value={draft.currentPassword}
                onChange={(event) => setDraft((current) => ({ ...current, currentPassword: event.target.value }))}
                aria-describedby={ids.currentHelp}
              />
              <p id={ids.currentHelp} className="text-xs text-muted-foreground">
                Necesaria para confirmar que la solicitud viene del usuario correcto.
              </p>
            </div>
          }
        />
        <SettingsRow
          label="Nueva contraseña"
          htmlFor={ids.next}
          control={
            <div className="flex flex-col gap-1">
              <Input
                id={ids.next}
                type="password"
                autoComplete="new-password"
                value={draft.nextPassword}
                onChange={(event) => setDraft((current) => ({ ...current, nextPassword: event.target.value }))}
                placeholder="Mínimo 8 caracteres"
                aria-describedby={ids.nextHelp}
              />
              <p id={ids.nextHelp} className="text-xs text-muted-foreground">
                Mínimo 8 caracteres. Puedes usar una frase fácil de recordar.
              </p>
            </div>
          }
        />
        <SettingsRow
          label="Confirmar nueva contraseña"
          htmlFor={ids.confirm}
          control={
            <div className="flex flex-col gap-1">
              <Input
                id={ids.confirm}
                type="password"
                autoComplete="new-password"
                value={draft.confirmPassword}
                onChange={(event) => setDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                aria-describedby={ids.confirmHelp}
              />
              <p id={ids.confirmHelp} className="text-xs text-muted-foreground">
                Escribe la misma contraseña para evitar errores de captura.
              </p>
            </div>
          }
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {success ? (
          <p role="status" aria-live="polite" className="text-sm text-foreground">
            {success}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar nueva contraseña"}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
