"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { completeFirstAccessAction } from "@/lib/auth/auth-actions";

type Draft = {
  nextPassword: string;
  confirmPassword: string;
};

const EMPTY_DRAFT: Draft = {
  nextPassword: "",
  confirmPassword: "",
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await completeFirstAccessAction(
        draft.nextPassword,
        draft.confirmPassword
      );
      if (!result.ok) {
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
        setError("No fue posible completar el primer acceso.");
        return;
      }

      setSuccess("Contrasena actualizada. Redirigiendo al Dashboard...");
      router.replace("/dashboard");
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#dbeafe,transparent_35%),radial-gradient(circle_at_86%_8%,#e2e8f0,transparent_32%),#f8fafc] px-4 py-10 sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Primer acceso</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Define tu nueva contrasena</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
                Este cambio es obligatorio antes de continuar al ERP. El sistema conservara tu sesion activa una vez que completes este paso.
              </p>
            </div>
            <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Requerido
            </span>
          </div>

          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-semibold">Politica de seguridad V1</p>
            <p className="mt-1 leading-relaxed text-blue-800">Usa una contrasena de al menos 8 caracteres. No pedimos complejidad extra por ahora para mantener el flujo simple.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Nueva contrasena</span>
              <input
                type="password"
                value={draft.nextPassword}
                onChange={(event) => setDraft((current) => ({ ...current, nextPassword: event.target.value }))}
                placeholder="Minimo 8 caracteres"
                aria-describedby="change-password-help"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <p id="change-password-help" className="-mt-2 text-xs leading-relaxed text-slate-500">Debe tener minimo 8 caracteres.</p>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Confirmar nueva contrasena</span>
              <input
                type="password"
                value={draft.confirmPassword}
                onChange={(event) => setDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Repite la contrasena"
                aria-describedby="change-password-confirm-help"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <p id="change-password-confirm-help" className="-mt-2 text-xs leading-relaxed text-slate-500">Escribe la misma contrasena para evitar errores de captura.</p>

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
              disabled={isPending}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isPending ? "Guardando..." : "Guardar y continuar"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-xl shadow-slate-300/40 sm:p-8">
          <h2 className="text-lg font-semibold">Experiencia esperada</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-slate-200">
            <li>1. Inicias con tu contrasena temporal.</li>
            <li>2. El sistema te obliga a definir una nueva contrasena.</li>
            <li>3. Al guardar, conservas la sesion activa.</li>
            <li>4. Continúas directamente al Dashboard.</li>
          </ol>

          <div className="mt-6 rounded-2xl border border-white/20 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Navegacion temporal</p>
            <div className="mt-3 grid gap-2">
              <Link href="/login" className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-center text-xs font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
                Regresar a Login
              </Link>
              <Link href="/profile" className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-center text-xs font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
                Ir a Perfil
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
