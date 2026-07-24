"use client";

import Link from "next/link";
import { useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import Avatar from "@/components/ui/Avatar";
import { changeCurrentUserPassword, getCollaboratorAccessState, resolveCurrentSessionAccess } from "@/lib/auth/auth-service";

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

  const authUser = resolveCurrentSessionAccess().user;
  if (!authUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <p className="text-sm text-slate-500">Validando acceso...</p>
      </main>
    );
  }

  const member = authUser.member;
  const accessState = getCollaboratorAccessState(member);

  const accessStatusLabel = accessState?.status ?? "Sin acceso al sistema";
  const accessBadgeClass = accessStatusLabel === "Acceso activo"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : accessStatusLabel === "Pendiente de primer acceso"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : accessStatusLabel === "Sin contraseña temporal"
        ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-100 text-slate-700";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const result = changeCurrentUserPassword(draft.currentPassword, draft.nextPassword, draft.confirmPassword);
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

      if (result.reason === "inactive_member") {
        setError("Tu cuenta esta inactiva. Contacta a un administrador.");
        return;
      }

      if (result.reason === "no_system_access") {
        setError("Tu cuenta no tiene acceso al sistema.");
        return;
      }

      setError("No fue posible actualizar la contrasena.");
      return;
    }

    setSuccess("Contrasena actualizada correctamente.");
    setDraft(EMPTY_PASSWORD_DRAFT);
  };

  return (
    <div className="flex min-h-screen bg-[#F5F7FB] text-slate-800">
      <Sidebar />

      <main className="h-screen flex-1 overflow-y-auto p-6 sm:p-8">
        <Header />

        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Perfil</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Seguridad y datos de acceso</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              Revisa el estado del colaborador, el estado del acceso y el cambio de contrasena desde una sola vista.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <Avatar name={member.name} showName={false} />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{member.name}</h1>
                <p className="text-sm text-slate-500">{member.role || "Sin puesto"}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-relaxed">
              <p><span className="font-medium text-slate-700">Correo institucional:</span> {member.institutionalEmail || "-"}</p>
              <p><span className="font-medium text-slate-700">Area:</span> {member.area || "-"}</p>
              <p><span className="font-medium text-slate-700">Telefono:</span> {member.phone || "-"}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Estado colaborador: {member.active ? "Activo" : "Inactivo"}
              </span>
              <span className={`rounded-lg border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${accessBadgeClass}`}>
                Estado acceso: {accessStatusLabel}
              </span>
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div>
                <p className="font-medium text-slate-800">Último acceso</p>
                <p className="mt-1">{accessState?.lastLoginAt ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(accessState.lastLoginAt)) : "Sin registro"}</p>
              </div>
              <div>
                <p className="font-medium text-slate-800">Último cambio de contraseña</p>
                <p className="mt-1">{accessState?.passwordUpdatedAt ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(accessState.passwordUpdatedAt)) : "Sin registro"}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Flujo de contraseña</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                En esta revisión, el cambio de contraseña se valida en la pantalla dedicada de primer acceso. Esta vista
                solo presenta el estado y la información del colaborador.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/change-password"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                >
                  Abrir cambio obligatorio
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2"
                >
                  Volver a Login
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Seguridad</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">Cambiar contrasena</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">Actualiza tu contrasena sin cerrar sesion y manteniendo la continuidad del trabajo.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Contrasena actual</span>
                <input
                  type="password"
                  value={draft.currentPassword}
                  onChange={(event) => setDraft((current) => ({ ...current, currentPassword: event.target.value }))}
                  aria-describedby="profile-current-password-help"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <p id="profile-current-password-help" className="-mt-2 text-xs leading-relaxed text-slate-500">Necesaria para confirmar que la solicitud viene del usuario correcto.</p>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Nueva contrasena</span>
                <input
                  type="password"
                  value={draft.nextPassword}
                  onChange={(event) => setDraft((current) => ({ ...current, nextPassword: event.target.value }))}
                  placeholder="Minimo 8 caracteres"
                  aria-describedby="profile-next-password-help"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <p id="profile-next-password-help" className="-mt-2 text-xs leading-relaxed text-slate-500">Minimo 8 caracteres. Puedes usar una frase facil de recordar.</p>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Confirmar nueva contrasena</span>
                <input
                  type="password"
                  value={draft.confirmPassword}
                  onChange={(event) => setDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                  aria-describedby="profile-confirm-password-help"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <p id="profile-confirm-password-help" className="-mt-2 text-xs leading-relaxed text-slate-500">Escribe la misma contrasena para evitar errores de captura.</p>

              {error ? (
                <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
                  {error}
                </p>
              ) : null}

              {success ? (
                <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-700">
                  {success}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              >
                Guardar nueva contrasena
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
