"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { connectMondayAction } from "@/lib/actions/monday-import-actions";
import type { MondayConnection } from "@/lib/types/monday-import";

/**
 * Paso 1: the token lives only in the wizard's state (never stored); with MONDAY_TOKEN on the server the field is
 * optional.
 */
export function ConnectStep({
  token,
  onTokenChange,
  hasServerToken,
  connection,
  onConnected,
}: {
  token: string;
  onTokenChange: (token: string) => void;
  hasServerToken: boolean;
  connection: MondayConnection | null;
  onConnected: (connection: MondayConnection) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function connect() {
    setError("");
    startTransition(async () => {
      try {
        const result = await connectMondayAction(token.trim() || null);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onConnected(result.connection);
      } catch {
        setError("No se pudo conectar con monday. Intenta de nuevo.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          connect();
        }}
      >
        <FormField className="space-y-2">
          <Label>Token de monday</Label>
          <Input
            type="password"
            autoComplete="off"
            value={token}
            placeholder={hasServerToken ? "Opcional: el servidor ya tiene un token" : "Pega tu token personal"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "monday-token-error" : "monday-token-hint"}
            onChange={(event) => onTokenChange(event.target.value)}
          />
          <p id="monday-token-hint" className="text-xs text-muted-foreground">
            En monday: tu avatar → Desarrolladores → Mis tokens. Solo se usa para exportar; no se guarda.
          </p>
          {error ? (
            <Alert id="monday-token-error" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FormField>
        <Button type="submit" disabled={isPending || (!hasServerToken && !token.trim())}>
          {isPending ? "Probando conexión…" : "Probar conexión"}
        </Button>
      </form>

      {connection ? (
        <Alert>
          <Check aria-hidden="true" />
          <AlertTitle>Conectado a {connection.account.name}</AlertTitle>
          <AlertDescription>
            Como {connection.tokenUser.name} ({connection.tokenUser.email}
            {connection.tokenSource === "env" ? ", token del servidor" : ""}). {connection.workspaces.length} espacios
            de trabajo, {connection.boards.length} tableros. Exportarlo todo con bitácora y archivos usa unas{" "}
            {connection.estimatedCalls.toLocaleString("es-MX")} llamadas a monday.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
