"use client";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Separator } from "@/components/ui/shadcn/separator";

import type { LoginCallbackError } from "@/lib/auth/login-callback-error";

import { AuthSplitLayout } from "./AuthSplitLayout";
import {
  CALLBACK_ERROR_MESSAGES,
  GOOGLE_START_URL,
  NO_SIGN_IN_MESSAGE,
  useCredentialsLogin,
} from "./use-credentials-login";

export type LoginFormProps = {
  googleEnabled: boolean;
  passwordEnabled: boolean;
  callbackError: LoginCallbackError | null;
};

/** Neutral "G" mark: no Google brand colors, inverted from the primary button. */
export function GoogleMark() {
  return (
    <span
      aria-hidden="true"
      data-testid="google-mark"
      className="inline-flex size-[22px] items-center justify-center rounded-full bg-primary-foreground text-[13px] font-semibold text-primary"
    >
      G
    </span>
  );
}

/**
 * `/login` (FE §3.10, canvas `Login`): split layout, "Continuar con Google" as
 * the primary action and the credentials form (`useCredentialsLogin`).
 */
export default function RedesignLoginForm({ googleEnabled, passwordEnabled, callbackError }: LoginFormProps) {
  const { draft, setEmail, setPassword, error, helpMessage, showHelp, canSubmit, handleSubmit } =
    useCredentialsLogin();

  const description = googleEnabled
    ? "Usa tu cuenta de Google del despacho."
    : passwordEnabled
      ? "Entra con tu correo y contraseña."
      : null;

  return (
    <AuthSplitLayout>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {callbackError ? (
            <Alert variant="destructive">
              <AlertDescription>{CALLBACK_ERROR_MESSAGES[callbackError]}</AlertDescription>
            </Alert>
          ) : null}

          {!googleEnabled && !passwordEnabled ? (
            <Alert>
              <AlertDescription>{NO_SIGN_IN_MESSAGE}</AlertDescription>
            </Alert>
          ) : null}

          {googleEnabled ? (
            <Button nativeButton={false} render={<a href={GOOGLE_START_URL} />} size="lg" className="h-11 w-full">
              <GoogleMark />
              Continuar con Google
            </Button>
          ) : null}

          {googleEnabled && passwordEnabled ? (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">o con correo</span>
              <Separator className="flex-1" />
            </div>
          ) : null}

          {passwordEnabled ? (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Correo institucional</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={draft.email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@cincel.mx"
                  aria-describedby="login-email-help"
                  className="h-10"
                />
                <p id="login-email-help" className="text-xs text-muted-foreground">
                  Debe coincidir con el correo registrado en Equipo.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <Label htmlFor="login-password">Contraseña</Label>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={showHelp}>
                    ¿Olvidaste tu contraseña?
                  </Button>
                </div>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={draft.password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="login-remember" />
                <Label htmlFor="login-remember" className="font-normal text-muted-foreground">
                  Mantener la sesión iniciada
                </Label>
              </div>

              {error ? (
                <Alert variant="destructive" role="alert" aria-live="polite">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {helpMessage ? (
                <Alert role="status" aria-live="polite">
                  <AlertDescription>{helpMessage}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                variant={googleEnabled ? "outline" : "default"}
                size="lg"
                disabled={!canSubmit}
                className="h-10 w-full"
              >
                Entrar
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </AuthSplitLayout>
  );
}
