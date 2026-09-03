"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { loginAction } from "@/lib/auth/auth-actions";

type LoginDraft = {
  email: string;
  password: string;
};

const DEFAULT_DRAFT: LoginDraft = {
  email: "",
  password: "",
};

export default function LoginPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<LoginDraft>(DEFAULT_DRAFT);
  const [error, setError] = useState<string>("");
  const [helpMessage, setHelpMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const canSubmit = useMemo(() => {
    return Boolean(draft.email.trim() && draft.password.trim()) && !isPending;
  }, [draft.email, draft.password, isPending]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setHelpMessage("");

    startTransition(async () => {
      const result = await loginAction(draft.email, draft.password);

      if (!result.ok) {
        if (result.reason === "inactive_member") {
          setError("Tu cuenta esta inactiva. Contacta a un administrador.");
          return;
        }
        if (result.reason === "auth_disabled") {
          setError("Esta cuenta no tiene acceso al sistema.");
          return;
        }
        if (result.reason === "password_not_set") {
          setError("La cuenta no tiene una contraseña temporal configurada.");
          return;
        }
        setError("Correo o contraseña incorrectos.");
        return;
      }

      router.replace(result.mustChangePassword ? "/change-password" : "/dashboard");
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-[1240px] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex overflow-hidden bg-[radial-gradient(circle_at_50%_12%,rgba(78,126,255,0.45),transparent_32%),radial-gradient(circle_at_62%_48%,rgba(26,86,255,0.7),transparent_48%),linear-gradient(145deg,#1651d7_0%,#0f4fd6_42%,#0a45c0_100%)] px-8 py-10 text-white sm:px-12 sm:py-12 lg:px-14 lg:py-14">
          <div className="absolute inset-0 opacity-25" aria-hidden="true" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative z-10 flex w-full flex-col justify-between">
            <div>
              <div className="mt-20 max-w-lg lg:mt-24">
                <p className="text-[18px] font-semibold tracking-tight text-white sm:text-[24px]">Cincel Despacho de Arquitectura</p>
                <div className="mt-3 h-[3px] w-10 rounded-full bg-white/90" aria-hidden="true" />
                <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Bienvenido a Workspace</h1>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/80 sm:text-[15px]">
                  El centro operativo inteligente para la gestión corporativa de alto impacto. Accede a tus proyectos,
                  recursos y equipo en una sola plataforma unificada.
                </p>
              </div>
            </div>

            <div className="mt-16 flex flex-wrap gap-8 text-sm text-white/90">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span className="font-semibold">Seguridad Corporativa</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </span>
                <span className="font-semibold">Tiempo Real</span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-[390px]">
            <div className="mb-8">
              <p className="text-2xl font-semibold tracking-tight text-slate-900">Iniciar Sesión</p>
              <p className="mt-1 text-[14px] leading-6 text-slate-500">Ingresa tus credenciales institucionales para continuar.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Correo institucional</span>
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="ejemplo@empresa.com"
                  aria-describedby="login-email-help"
                  className="h-11"
                />
              </label>
              <p id="login-email-help" className="-mt-2 text-[11px] leading-5 text-slate-500">Debe coincidir con el correo registrado en Equipo.</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <label className="block flex-1">
                    <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Contraseña</span>
                  </label>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-[11px] font-semibold uppercase tracking-[0.1em]"
                    onClick={() => setHelpMessage("Contacta a tu director")}
                  >
                    ¿Olvidaste tu contraseña?
                  </Button>
                </div>

                <Input
                  type="password"
                  value={draft.password}
                  onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
                  placeholder="••••••••"
                  aria-describedby="login-password-help"
                  className="h-11"
                />
              </div>
              <p id="login-password-help" className="-mt-2 text-[11px] leading-5 text-slate-500">Si es tu primer acceso, usa la contraseña temporal inicial del administrador: CincelAdmin2026!.</p>

              <label className="flex items-center gap-2 pt-1 text-[13px] text-slate-600">
                <Checkbox />
                Mantener sesión iniciada
              </label>

              {error ? (
                <p role="alert" aria-live="polite" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
                  {error}
                </p>
              ) : null}

              {helpMessage ? (
                <p role="status" aria-live="polite" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
                  {helpMessage}
                </p>
              ) : null}

              <Button type="submit" disabled={!canSubmit} className="h-12 w-full text-[15px]">
                Entrar
                <span aria-hidden="true">›</span>
              </Button>
            </form>

            <div className="my-6 h-px bg-slate-200" aria-hidden="true" />

            <div className="grid gap-2 text-center text-[13px] text-slate-600">
              <p>¿Problemas para acceder?</p>
              <Button
                variant="link"
                className="h-auto p-0 font-semibold"
                onClick={() => setHelpMessage("Contacta a tu director")}
              >
                Contactar a Soporte IT
              </Button>

              <div className="mt-4 flex items-center justify-center gap-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" />
                  Español
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" />
                  Privacidad
                </span>
              </div>
            </div>

          </div>
        </section>
      </div>
    </main>
  );
}
