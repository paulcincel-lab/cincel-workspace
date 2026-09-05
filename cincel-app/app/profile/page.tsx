"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import AppAvatar from "@/components/ui/AppAvatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { getCollaboratorAccessState, resolveCurrentSessionAccess } from "@/lib/auth/auth-service";
import { changePasswordAction } from "@/lib/auth/auth-actions";

type PasswordDraft = {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
};

const EMPTY_PASSWORD_DRAFT: PasswordDraft = {
  currentPassword: "",
  nextPassword: "",
  confirmPassword: "",
};

export default function ProfilePage() {
  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  const authUser = resolveCurrentSessionAccess().user;
  if (!authUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Validando acceso...</p>
      </main>
    );
  }

  const member = authUser.member;
  const accessState = getCollaboratorAccessState(member);

  const accessStatusLabel = accessState?.status ?? "Sin acceso al sistema";
  const accessBadgeVariant = accessStatusLabel === "Acceso activo"
    ? "success"
    : accessStatusLabel === "Sin contraseña temporal"
      ? "destructive"
      : "outline";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await changePasswordAction(
        draft.currentPassword,
        draft.nextPassword,
        draft.confirmPassword
      );
      if (!result.ok) {
        if (result.reason === "invalid_current_password") {
          setError("La contrasena actual no es correcta.");
          return;
        }
        if (result.reason === "password_too_short") {
          setError("La nueva contrasena debe tener al menos 8 caracteres.");
          return;
        }
        if (result.reason === "password_confirmation_mismatch") {
          setError("La confirmacion no coincide con la nueva contrasena.");
          return;
        }
        if (result.reason === "no_session") {
          setError("Tu sesion expiro. Inicia sesion de nuevo.");
          return;
        }
        setError("No fue posible actualizar la contrasena.");
        return;
      }

      setSuccess("Contrasena actualizada correctamente.");
      setDraft(EMPTY_PASSWORD_DRAFT);
    });
  };

  return (
    <div className="flex min-h-screen bg-muted text-foreground">
      <Sidebar />

      <main className="h-screen flex-1 overflow-y-auto p-6 sm:p-8">
        <Header />

        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Perfil</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">Seguridad y datos de acceso</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Revisa el estado del colaborador, el estado del acceso y el cambio de contrasena desde una sola vista.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <AppAvatar name={member.name} showName={false} />
              <div>
                <h1 className="text-2xl font-bold text-foreground">{member.name}</h1>
                <p className="text-sm text-muted-foreground">{member.role || "Sin puesto"}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-relaxed">
              <p><span className="font-medium text-foreground">Correo institucional:</span> {member.institutionalEmail || "-"}</p>
              <p><span className="font-medium text-foreground">Area:</span> {member.area || "-"}</p>
              <p><span className="font-medium text-foreground">Telefono:</span> {member.phone || "-"}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant={member.active ? "success" : "secondary"}>
                Estado colaborador: {member.active ? "Activo" : "Inactivo"}
              </Badge>
              <Badge variant={accessBadgeVariant}>
                Estado acceso: {accessStatusLabel}
              </Badge>
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Último acceso</p>
                <p className="mt-1">{accessState?.lastLoginAt ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(accessState.lastLoginAt)) : "Sin registro"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Último cambio de contraseña</p>
                <p className="mt-1">{accessState?.passwordUpdatedAt ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(accessState.passwordUpdatedAt)) : "Sin registro"}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Flujo de contraseña</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                En esta revisión, el cambio de contraseña se valida en la pantalla dedicada de primer acceso. Esta vista
                solo presenta el estado y la información del colaborador.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/change-password"
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Abrir cambio obligatorio
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Volver a Login
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Seguridad</p>
              <h2 className="mt-1 text-2xl font-bold text-foreground">Cambiar contrasena</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Actualiza tu contrasena sin cerrar sesion y manteniendo la continuidad del trabajo.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contrasena actual</span>
                <Input
                  type="password"
                  value={draft.currentPassword}
                  onChange={(event) => setDraft((current) => ({ ...current, currentPassword: event.target.value }))}
                  aria-describedby="profile-current-password-help"
                />
              </label>
              <p id="profile-current-password-help" className="-mt-2 text-xs leading-relaxed text-muted-foreground">Necesaria para confirmar que la solicitud viene del usuario correcto.</p>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nueva contrasena</span>
                <Input
                  type="password"
                  value={draft.nextPassword}
                  onChange={(event) => setDraft((current) => ({ ...current, nextPassword: event.target.value }))}
                  placeholder="Minimo 8 caracteres"
                  aria-describedby="profile-next-password-help"
                />
              </label>
              <p id="profile-next-password-help" className="-mt-2 text-xs leading-relaxed text-muted-foreground">Minimo 8 caracteres. Puedes usar una frase facil de recordar.</p>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmar nueva contrasena</span>
                <Input
                  type="password"
                  value={draft.confirmPassword}
                  onChange={(event) => setDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                  aria-describedby="profile-confirm-password-help"
                />
              </label>
              <p id="profile-confirm-password-help" className="-mt-2 text-xs leading-relaxed text-muted-foreground">Escribe la misma contrasena para evitar errores de captura.</p>

              {error ? (
                <p role="alert" aria-live="polite" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
                  {error}
                </p>
              ) : null}

              {success ? (
                <p role="status" aria-live="polite" className="rounded-xl border border-success-foreground/30 bg-success px-3 py-2 text-xs leading-relaxed text-success-foreground">
                  {success}
                </p>
              ) : null}

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Guardando..." : "Guardar nueva contrasena"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
