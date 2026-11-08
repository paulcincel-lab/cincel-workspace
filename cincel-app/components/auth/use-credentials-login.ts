"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { loginAction } from "@/lib/auth/auth-actions";
import type { LoginCallbackError } from "@/lib/auth/login-callback-error";

/** Where the "Continuar con Google" / "Entrar con Google" link starts the Google sign-in. */
export const GOOGLE_START_URL = "/api/auth/google/start";

/** Copy for the `?error=` values of `/login` (state cookie expired, Google could not be checked). */
export const CALLBACK_ERROR_MESSAGES: Record<LoginCallbackError, string> = {
  state: "La sesión de inicio expiró. Intenta de nuevo.",
  retry: "No pudimos verificar tu acceso con Google. Intenta de nuevo.",
};

/** Shown when nobody can sign in (Google and password both off). */
export const NO_SIGN_IN_MESSAGE = "El inicio de sesión no está disponible. Contacta a tu director.";

/** Shown by "¿Olvidaste tu contraseña?" and the support link. */
export const HELP_MESSAGE = "Contacta a tu director";

type LoginDraft = {
  email: string;
  password: string;
};

const DEFAULT_DRAFT: LoginDraft = {
  email: "",
  password: "",
};

/**
 * Email + password sign-in state shared by the legacy and the redesigned login
 * forms: one submit path to `loginAction`, the same error copy and the same
 * redirect (`/change-password` when the password must change, else `/inicio`).
 */
export function useCredentialsLogin() {
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
        if (result.reason === "password_login_disabled") {
          setError("El acceso con contraseña está desactivado. Entra con Google.");
          return;
        }
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

      router.replace(result.mustChangePassword ? "/change-password" : "/inicio");
      router.refresh(); // data-patterns: auth
    });
  };

  return {
    draft,
    setEmail: (email: string) => setDraft((current) => ({ ...current, email })),
    setPassword: (password: string) => setDraft((current) => ({ ...current, password })),
    error,
    helpMessage,
    showHelp: () => setHelpMessage(HELP_MESSAGE),
    isPending,
    canSubmit,
    handleSubmit,
  };
}
