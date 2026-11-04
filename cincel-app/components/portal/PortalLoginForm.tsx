"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { PORTAL_LINK_INVALID_MESSAGE, PORTAL_RATE_LIMITED_MESSAGE } from "@/lib/portal/auth-flow";

/** POST `{ email }` → 200 for every valid address (known or not), 400 `invalid_email`, 429 `rate_limited`. */
export const PORTAL_LINK_ENDPOINT = "/api/portal/auth/link";
/** Seconds before **Reenviar enlace** is enabled again. */
export const PORTAL_RESEND_SECONDS = 60;

export const PORTAL_INVALID_EMAIL_MESSAGE = "Escribe un correo válido.";
export const PORTAL_SEND_FAILED_MESSAGE = "No pudimos enviar el enlace. Intenta de nuevo.";
const EMAIL_INPUT_ID = "portal-login-email";
const EMAIL_ERROR_ID = "portal-login-email-error";

type Step = "request" | "sent";

export type PortalLoginFormProps = {
  /** `?error=link`: the sign-in link was used, expired or unknown. */
  linkError: boolean;
  /** `?email=` prefill. */
  initialEmail?: string;
};

/** Requests a link; resolves to the error to show, or null when the "Revisa tu correo" state should follow. */
async function requestLink(email: string): Promise<string | null> {
  try {
    const response = await fetch(PORTAL_LINK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (response.ok) return null;
    if (response.status === 429) return PORTAL_RATE_LIMITED_MESSAGE;
    if (response.status === 400) return PORTAL_INVALID_EMAIL_MESSAGE;
    return PORTAL_SEND_FAILED_MESSAGE;
  } catch {
    return PORTAL_SEND_FAILED_MESSAGE;
  }
}

/**
 * Portal sign-in (FE §3.1, replaced by the magic link in #534): email → **Enviar enlace** → "Revisa tu correo"
 * with the address and a 60 s countdown before **Reenviar enlace**. The same message is shown whether or not
 * the email has access; the route answers the same way for both.
 */
export default function PortalLoginForm({ linkError, initialEmail = "" }: PortalLoginFormProps) {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState("");
  // The expired-link notice is shown from the first render, so it never shifts the form; every other error goes
  // under the field (or under the resend buttons) in a slot that keeps its height.
  const [linkNotice, setLinkNotice] = useState(linkError);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const send = async (address: string) => {
    setPending(true);
    setError("");
    const failure = await requestLink(address);
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setSentTo(address);
    setLinkNotice(false);
    setStep("sent");
    setSecondsLeft(PORTAL_RESEND_SECONDS);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setError(PORTAL_INVALID_EMAIL_MESSAGE);
      return;
    }
    void send(address);
  };

  const changeEmail = () => {
    setStep("request");
    setError("");
    setSecondsLeft(0);
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{step === "request" ? "Entra al portal" : "Revisa tu correo"}</CardTitle>
        <CardDescription>
          {step === "request"
            ? "Escribe tu correo y te enviaremos un enlace para entrar."
            : "Si tu correo tiene acceso, te enviamos un enlace."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "request" && linkNotice ? (
          <Alert variant="destructive">
            <AlertDescription>{PORTAL_LINK_INVALID_MESSAGE}</AlertDescription>
          </Alert>
        ) : null}
        {step === "sent" ? (
          <p className="text-sm text-muted-foreground">
            Si tiene acceso, el enlace llegará a <span className="font-medium text-foreground">{sentTo}</span>. Vence
            en 15 minutos y solo funciona una vez.
          </p>
        ) : null}

        {step === "request" ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={EMAIL_INPUT_ID}>Correo</Label>
              <Input
                id={EMAIL_INPUT_ID}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? EMAIL_ERROR_ID : undefined}
                className="h-11"
              />
              <p id={EMAIL_ERROR_ID} aria-live="polite" className="min-h-5 text-sm text-destructive">
                {error}
              </p>
            </div>
            <Button type="submit" size="lg" disabled={pending} className="min-h-11 w-full">
              {pending ? "Enviando…" : "Enviar enlace"}
            </Button>
          </form>
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={pending || secondsLeft > 0}
              onClick={() => void send(sentTo)}
              className="min-h-11 w-full"
            >
              {secondsLeft > 0 ? `Reenviar enlace en ${secondsLeft} s` : "Reenviar enlace"}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={changeEmail} className="min-h-11 w-full">
              Cambiar correo
            </Button>
            <p aria-live="polite" className="min-h-5 text-sm text-destructive">
              {error}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
