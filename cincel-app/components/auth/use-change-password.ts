"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { completeFirstAccessAction } from "@/lib/auth/auth-actions";

/** Minimum length enforced by `completeFirstAccessAction` (backend spec §A.5.1). */
export const MIN_PASSWORD_LENGTH = 8;

export type ChangePasswordDraft = {
  nextPassword: string;
  confirmPassword: string;
};

const EMPTY_DRAFT: ChangePasswordDraft = {
  nextPassword: "",
  confirmPassword: "",
};

/** Error copy per `completeFirstAccessAction` failure reason. */
export function changePasswordErrorText(reason: string): string {
  switch (reason) {
    case "password_login_disabled":
      return "El acceso con contraseña está desactivado. Entra con Google.";
    case "password_too_short":
      return "La nueva contraseña debe tener al menos 8 caracteres.";
    case "password_confirmation_mismatch":
      return "La confirmación no coincide con la nueva contraseña.";
    case "no_session":
      return "Tu sesión expiró. Inicia sesión de nuevo.";
    default:
      return "No fue posible completar el primer acceso.";
  }
}

export const CHANGE_PASSWORD_SUCCESS = "Contraseña actualizada. Redirigiendo al Dashboard...";

/**
 * First-access password change: draft, submit through
 * `completeFirstAccessAction`, error / success copy and the redirect to
 * /inicio. Shared by the legacy and the redesigned form so both submit the
 * same way.
 */
export function useChangePassword() {
  const router = useRouter();
  const [draft, setDraft] = useState<ChangePasswordDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const setNextPassword = (value: string) => setDraft((current) => ({ ...current, nextPassword: value }));
  const setConfirmPassword = (value: string) => setDraft((current) => ({ ...current, confirmPassword: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    startTransition(async () => {
      const result = await completeFirstAccessAction(draft.nextPassword, draft.confirmPassword); // data-patterns: auth
      if (!result.ok) {
        setError(changePasswordErrorText(result.reason));
        return;
      }

      setSuccess(CHANGE_PASSWORD_SUCCESS);
      router.replace("/inicio");
      router.refresh(); // data-patterns: auth
    });
  };

  return { draft, setNextPassword, setConfirmPassword, error, success, isPending, handleSubmit };
}
