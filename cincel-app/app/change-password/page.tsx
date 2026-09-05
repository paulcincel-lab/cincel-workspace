"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
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
    <main className="min-h-screen bg-muted px-4 py-10 sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Primer acceso</p>
              <h1 className="mt-2 text-3xl font-bold text-foreground">Define tu nueva contrasena</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Este cambio es obligatorio antes de continuar al ERP. El sistema conservara tu sesion activa una vez que completes este paso.
              </p>
            </div>
            <span className="rounded-xl border border-border bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
              Requerido
            </span>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-muted p-4 text-sm text-foreground">
            <p className="font-semibold">Politica de seguridad V1</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">Usa una contrasena de al menos 8 caracteres. No pedimos complejidad extra por ahora para mantener el flujo simple.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nueva contrasena</span>
              <Input
                type="password"
                value={draft.nextPassword}
                onChange={(event) => setDraft((current) => ({ ...current, nextPassword: event.target.value }))}
                placeholder="Minimo 8 caracteres"
                aria-describedby="change-password-help"
              />
            </label>
            <p id="change-password-help" className="-mt-2 text-xs leading-relaxed text-muted-foreground">Debe tener minimo 8 caracteres.</p>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmar nueva contrasena</span>
              <Input
                type="password"
                value={draft.confirmPassword}
                onChange={(event) => setDraft((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Repite la contrasena"
                aria-describedby="change-password-confirm-help"
              />
            </label>
            <p id="change-password-confirm-help" className="-mt-2 text-xs leading-relaxed text-muted-foreground">Escribe la misma contrasena para evitar errores de captura.</p>

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
              {isPending ? "Guardando..." : "Guardar y continuar"}
            </Button>
          </form>
        </section>

        <section className="rounded-3xl border border-border bg-foreground p-6 text-background shadow-xl sm:p-8">
          <h2 className="text-lg font-semibold">Experiencia esperada</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-background/80">
            <li>1. Inicias con tu contrasena temporal.</li>
            <li>2. El sistema te obliga a definir una nueva contrasena.</li>
            <li>3. Al guardar, conservas la sesion activa.</li>
            <li>4. Continúas directamente al Dashboard.</li>
          </ol>

          <div className="mt-6 rounded-2xl border border-background/20 bg-background/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-background/70">Navegacion temporal</p>
            <div className="mt-3 grid gap-2">
              <Link href="/login" className="rounded-lg border border-background/20 bg-background/5 px-3 py-2 text-center text-xs font-medium text-background transition hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground">
                Regresar a Login
              </Link>
              <Link href="/profile" className="rounded-lg border border-background/20 bg-background/5 px-3 py-2 text-center text-xs font-medium text-background transition hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground">
                Ir a Perfil
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
