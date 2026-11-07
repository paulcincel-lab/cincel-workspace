"use client";

import { CheckIcon, CircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";

import { MIN_PASSWORD_LENGTH, useChangePassword } from "./use-change-password";

const REQUIREMENTS_ID = "change-password-requirements";

export const CHANGE_PASSWORD_REDESIGN_SUCCESS = "Contraseña actualizada. Redirigiendo a Inicio…";

function Requirement({ met, children }: { met: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-2 ${met ? "text-success" : "text-muted-foreground"}`}>
      {met ? <CheckIcon aria-hidden="true" className="size-4" /> : <CircleIcon aria-hidden="true" className="size-4" />}
      <span>{children}</span>
      <span className="sr-only">{met ? "(cumplido)" : "(pendiente)"}</span>
    </li>
  );
}

/**
 * Redesigned first-access form (FE §3.10, canvas `CambioContrasena`), rendered
 * inside `AuthSplitLayout`. Same fields, validation and submit as the legacy
 * form (`useChangePassword`); the requirement list mirrors the server policy.
 * Ignores the presentation style (FE §15.3).
 */
export default function ChangePasswordCard() {
  const { draft, setNextPassword, setConfirmPassword, error, success, isPending, handleSubmit } =
    useChangePassword();

  const next = draft.nextPassword.trim();
  const longEnough = next.length >= MIN_PASSWORD_LENGTH;
  const matches = next.length > 0 && next === draft.confirmPassword.trim();

  return (
    <Card>
      <CardHeader>
        <Badge variant="outline">Obligatorio</Badge>
        <CardTitle>
          <h1 className="text-[22px] leading-tight font-semibold">Cambia tu contraseña</h1>
        </CardTitle>
        <CardDescription>Es tu primer inicio de sesión. Elige una contraseña nueva para continuar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormField className="flex flex-col gap-1.5">
            <Label>Contraseña nueva</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={draft.nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              aria-describedby={REQUIREMENTS_ID}
              className="h-10"
            />
          </FormField>

          <ul
            id={REQUIREMENTS_ID}
            aria-label="Requisitos"
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-3.5 py-3 text-sm"
          >
            <Requirement met={longEnough}>Al menos 8 caracteres</Requirement>
            <Requirement met={matches}>Las dos contraseñas coinciden</Requirement>
          </ul>

          <FormField className="flex flex-col gap-1.5">
            <Label>Confirmar contraseña nueva</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={draft.confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repite la contraseña"
              aria-describedby={REQUIREMENTS_ID}
              className="h-10"
            />
          </FormField>

          {error ? (
            <Alert variant="destructive" aria-live="polite">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {success ? (
            <Alert role="status" aria-live="polite">
              <AlertDescription>{CHANGE_PASSWORD_REDESIGN_SUCCESS}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={isPending} className="h-10 w-full">
            {isPending ? "Guardando..." : "Guardar y continuar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
