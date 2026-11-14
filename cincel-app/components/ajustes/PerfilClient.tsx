"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { SettingsSaveBar } from "@/components/ajustes/SettingsSaveBar";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { usePhotoUploadMutation, useRemovePhotoMutation } from "@/components/shell/photo-upload";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/shadcn/avatar";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
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
import type { DayHours, PerfilData, WeekHours } from "@/lib/types/redesign";
import { isGoogleManagedRefusal } from "@/lib/types/workspace-access";
import { cn } from "@/lib/utils";

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

/** Whole hours and minutes of a decimal hour count (rounded to the minute). */
function hoursAndMinutes(hours: number): { h: number; m: number } {
  const minutes = Math.max(0, Math.round(hours * 60));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}

/** "32 h 30 min de 40 h" (or "6 h" when there is no target this week). */
export function formatWeekHoursLine(week: WeekHours): string {
  const { h, m } = hoursAndMinutes(week.total);
  const total = m > 0 ? `${h} h ${m} min` : `${h} h`;
  return week.target > 0 ? `${total} de ${hoursFormat.format(week.target)} h` : total;
}

const WEEKDAY_LABELS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"] as const;

/** "8 h 30", "8 h", or "—" without a record. */
export function formatDayHours(hours: number): string {
  if (!(hours > 0)) return "—";
  const { h, m } = hoursAndMinutes(hours);
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** "LUN 9 · 8 h 30" for one day (`date` is a local `YYYY-MM-DD`). */
export function formatDayLine(day: DayHours): string {
  const [year, month, date] = day.date.split("-").map(Number);
  const weekday = new Date(year, (month ?? 1) - 1, date ?? 1).getDay();
  return `${WEEKDAY_LABELS[weekday]} ${date} · ${formatDayHours(day.hours)}`;
}

/** Monday to Friday of the week, in order (weekend days are left out). */
export function weekdaysOf(week: WeekHours): DayHours[] {
  return week.days
    .filter((day) => {
      const [year, month, date] = day.date.split("-").map(Number);
      const weekday = new Date(year, (month ?? 1) - 1, date ?? 1).getDay();
      return weekday >= 1 && weekday <= 5;
    })
    .slice(0, 5);
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
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </PerfilFormStoreProvider>
  );
}

/** One labelled field of a settings grid: label 13 px / 500, gap 6 px, hint 12 px. */
function Field({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  hintId?: string;
  error?: string | null;
  errorId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Read-only inputs: `--muted` background, `--muted-foreground` text. */
const READ_ONLY_INPUT_CLASS = "bg-muted text-muted-foreground";

/** Two-column field grid (one column below 640 px), gap 14 × 16 px. */
const FIELD_GRID_CLASS = "grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2";

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
    <SettingsSection
      title="Foto de perfil"
      description={<span id={hintId}>{PHOTO_HINT}</span>}
      icon={
        <Avatar className="size-16">
          {photoUrl ? <AvatarImage src={photoUrl} alt="Tu foto de perfil" /> : null}
          <AvatarFallback className="bg-secondary text-xl font-semibold text-secondary-foreground">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
      }
      actions={
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Elegir una foto"
            aria-describedby={hintId}
            tabIndex={-1}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => inputRef.current?.click()}
            aria-describedby={hintId}
          >
            {pending === "upload" ? "Subiendo…" : "Cambiar foto"}
          </Button>
          {photoUrl && PHOTO_IMPLEMENTED.removeMyPhotoAction ? (
            <Button type="button" variant="ghost" disabled={pending !== null} onClick={onRemove}>
              {pending === "remove" ? "Quitando…" : "Quitar"}
            </Button>
          ) : null}
        </>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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
    puestoHint: useId(),
    email: useId(),
    emailHint: useId(),
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
    successToast: "Cambios guardados",
    onFormError: (text) => form.getState().setFormError(text),
  });
  const isPending = save.isPending;

  const staffChanged = name.trim() !== data.name || phone.trim() !== data.phone;
  const signatureChanged = signature.trim() !== data.emailSignature.trim();
  const dirtyCount =
    Number(name.trim() !== data.name) + Number(phone.trim() !== data.phone) + Number(signatureChanged);
  const nameRef = useRef<HTMLInputElement>(null);

  const onCancel = () => form.getState().reset();

  const submit = () => {
    const state = form.getState();
    state.setFormError(null);
    if (!name.trim()) {
      state.setFieldError("name", NAME_REQUIRED_COPY);
      nameRef.current?.focus();
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

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dirtyCount > 0 && !isPending) submit();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <SettingsSection title="Datos personales">
        <div className={FIELD_GRID_CLASS}>
          <Field id={ids.name} label="Nombre" error={nameError} errorId={ids.nameError}>
            <Input
              ref={nameRef}
              id={ids.name}
              value={name}
              onChange={(event) => setField("name", event.target.value)}
              autoComplete="name"
              maxLength={120}
              required
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? ids.nameError : undefined}
            />
          </Field>
          <Field id={ids.puesto} label="Puesto" hint={PUESTO_HINT} hintId={ids.puestoHint}>
            <Input
              id={ids.puesto}
              value={data.puesto || "Sin puesto"}
              readOnly
              aria-describedby={ids.puestoHint}
              className={READ_ONLY_INPUT_CLASS}
            />
          </Field>
          <Field id={ids.email} label="Correo" hint={CORREO_HINT} hintId={ids.emailHint}>
            <Input
              id={ids.email}
              type="email"
              value={data.email}
              readOnly
              aria-describedby={ids.emailHint}
              className={READ_ONLY_INPUT_CLASS}
            />
          </Field>
          <Field id={ids.phone} label="Teléfono">
            <Input
              id={ids.phone}
              type="tel"
              value={phone}
              onChange={(event) => setField("phone", event.target.value)}
              autoComplete="tel"
              maxLength={40}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection title="Firma">
        <Field id={ids.signature} label="Firma de correo">
          <Textarea
            id={ids.signature}
            rows={3}
            value={signature}
            onChange={(event) => setField("emailSignature", event.target.value)}
            maxLength={2000}
          />
        </Field>
      </SettingsSection>

      <SettingsSection title="Idioma y región" description={REGION_HINT}>
        <div className={FIELD_GRID_CLASS}>
          <Field id={ids.language} label="Idioma">
            <Input id={ids.language} value={PERFIL_LANGUAGE_LABEL} readOnly className={READ_ONLY_INPUT_CLASS} />
          </Field>
          <Field id={ids.timeZone} label="Zona horaria">
            <Input id={ids.timeZone} value={PERFIL_TIME_ZONE_LABEL} readOnly className={READ_ONLY_INPUT_CLASS} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSaveBar
        dirtyCount={dirtyCount}
        saving={isPending}
        error={error}
        saveLabel="Guardar cambios"
        onDiscard={onCancel}
        onSave={submit}
      />
    </form>
  );
}

// ── Mis horas esta semana ───────────────────────────────────────────────────

/**
 * This week's hours against the target (badge) and one bar per weekday;
 * absent unless time tracking is enabled for the person.
 */
export function PerfilHorasSemana() {
  const { week } = usePerfilData();
  if (!week) return null;
  const days = weekdaysOf(week);
  const dailyTarget = week.target > 0 ? week.target / 5 : 8;
  return (
    <SettingsSection
      title="Mis horas esta semana"
      actions={
        <Badge variant="outline" className="font-mono">
          {formatWeekHoursLine(week)}
        </Badge>
      }
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {days.map((day) => {
          const ratio = Math.min(1, Math.max(0, day.hours / dailyTarget));
          return (
            <li key={day.date} className="flex flex-col gap-1.5">
              <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="grow-x block h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
              </span>
              <span className="font-mono text-[11.5px] text-muted-foreground">{formatDayLine(day)}</span>
            </li>
          );
        })}
      </ul>
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

/** `changePasswordAction` with one object argument, for the mutation. */
function changePassword(draft: PasswordDraft) {
  return changePasswordAction(draft.currentPassword, draft.nextPassword, draft.confirmPassword);
}

/** The existing password change (`changePasswordAction`), with its own button outside the save bar. */
export function PerfilContrasena() {
  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // No cache effect: the password is not shown anywhere.
  const change = useActionMutation(changePassword, { onFormError: (text) => setError(text) });
  const isPending = change.isPending;
  const ids = { current: useId(), next: useId(), confirm: useId() };

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
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-3">
          <Field id={ids.current} label="Contraseña actual">
            <Input
              id={ids.current}
              type="password"
              autoComplete="current-password"
              value={draft.currentPassword}
              onChange={(event) => setDraft((current) => ({ ...current, currentPassword: event.target.value }))}
            />
          </Field>
          <Field id={ids.next} label="Nueva contraseña">
            <Input
              id={ids.next}
              type="password"
              autoComplete="new-password"
              value={draft.nextPassword}
              onChange={(event) => setDraft((current) => ({ ...current, nextPassword: event.target.value }))}
              placeholder="Mínimo 8 caracteres"
            />
          </Field>
          <Field id={ids.confirm} label="Confirmar nueva contraseña">
            <Input
              id={ids.confirm}
              type="password"
              autoComplete="new-password"
              value={draft.confirmPassword}
              onChange={(event) => setDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
              placeholder="Mínimo 8 caracteres"
            />
          </Field>
        </div>
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
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar nueva contraseña"}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
