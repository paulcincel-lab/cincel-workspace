"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";

import { GoogleGroupMappings, GROUP_MAPPING_ERROR_MESSAGES } from "@/components/configuracion/GoogleGroupMappings";
import { WizardStepper } from "@/components/configuracion/WizardStepper";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { completeOnboardingAction } from "@/lib/actions/onboarding-actions";
import { createGroupMappingAction } from "@/lib/actions/workspace-access-actions";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import {
  ADMIN_GROUP_RANK,
  GOOGLE_SETUP_STEPS,
  SIGN_OUT_TO_GOOGLE_LOGIN,
  canAdvance,
  doneMessage,
  findAdminGroup,
  initialStep,
  nextStep,
  previousStep,
  reviewChecks,
  stepIndex,
  type GoogleSetupStepId,
} from "@/lib/onboarding/google-setup-steps";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";

export type GoogleSetupWizardProps = {
  /** Null when `getGoogleHealthAction()` failed. */
  health: GoogleHealth | null;
  mappings: GroupMapping[];
  positions: { id: string; name: string }[];
};

function ReviewStep({ health }: { health: GoogleHealth | null }) {
  return (
    <div className="space-y-4">
      {!health ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar el estado de Google. Recarga la página.</AlertDescription>
        </Alert>
      ) : null}
      <ul className="divide-y divide-border">
        {reviewChecks(health).map((check) => (
          <li key={check.id} className="grid gap-1 py-3 sm:grid-cols-[16rem_1fr] sm:items-start">
            <span className="text-sm text-muted-foreground">
              {check.label}
              {check.required ? null : " (opcional)"}
            </span>
            <div className="space-y-1 text-sm text-foreground">
              {check.ok ? (
                <Badge variant="secondary">
                  <Check data-icon="inline-start" aria-hidden="true" />
                  Configurado
                </Badge>
              ) : (
                <Badge variant="outline">
                  <TriangleAlert data-icon="inline-start" aria-hidden="true" />
                  Falta
                </Badge>
              )}
              {check.ok && check.value ? <p className="break-all font-mono">{check.value}</p> : null}
              {check.ok ? null : <p className="text-muted-foreground">{check.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminGroupStep({ mappings, domain }: { mappings: GroupMapping[]; domain: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [groupEmail, setGroupEmail] = useState("");
  const [error, setError] = useState("");
  const adminGroup = findAdminGroup(mappings);

  if (adminGroup) {
    return (
      <Alert>
        <Check aria-hidden="true" />
        <AlertTitle>Grupo de administradores asignado</AlertTitle>
        <AlertDescription>
          {adminGroup.groupEmail} da el rol {SYSTEM_ADMIN_ROLE}. Puedes cambiarlo en el siguiente paso.
        </AlertDescription>
      </Alert>
    );
  }

  function save() {
    setError("");
    startTransition(async () => {
      try {
        const result = await createGroupMappingAction({
          groupEmail,
          kind: "role",
          role: SYSTEM_ADMIN_ROLE,
          positionId: null,
          rank: ADMIN_GROUP_RANK,
        });
        if (!result.ok) {
          setError(GROUP_MAPPING_ERROR_MESSAGES[result.error]);
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo guardar el grupo.");
      }
    });
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Quien esté en este grupo de Google Workspace entra como {SYSTEM_ADMIN_ROLE} (rango {ADMIN_GROUP_RANK}).
      </p>
      <FormField className="space-y-2">
        <Label>Correo del grupo</Label>
        <Input
          type="email"
          required
          placeholder={domain ? `administradores@${domain}` : "administradores@empresa.com"}
          value={groupEmail}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "admin-group-error" : undefined}
          onChange={(event) => setGroupEmail(event.target.value)}
        />
        {error ? (
          <Alert id="admin-group-error" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </FormField>
      <Button type="submit" disabled={isPending || !groupEmail.trim()}>
        {isPending ? "Validando en Google…" : "Guardar grupo"}
      </Button>
    </form>
  );
}

function DoneStep({ domain }: { domain: string | null }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-foreground">{doneMessage(domain)}</p>
      <p className="text-muted-foreground">
        Puedes cambiar los grupos cuando quieras en{" "}
        <Link href="/ajustes/google" className="underline underline-offset-4">
          Configuración → Google
        </Link>
        .
      </p>
    </div>
  );
}

const STEP_DESCRIPTIONS: Record<GoogleSetupStepId, string> = {
  review: "Revisa que Google esté configurado antes de asignar grupos.",
  admin_group: "Elige el grupo de Google Workspace cuyos miembros serán administradores.",
  more_groups: "Asigna los grupos de otros roles y de las áreas. Puedes hacerlo después.",
  done: "Ya se puede entrar con Google.",
};

/**
 * First-login wizard of the bootstrap admin (#671): only sets up the Google groups so others can sign in with
 * Google. "Omitir por ahora" and finishing both mark it completed for this staff member.
 */
export function GoogleSetupWizard({ health, mappings, positions }: GoogleSetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<GoogleSetupStepId>(() => initialStep({ health, mappings }));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const domain = health?.workspaceDomain ?? null;
  const state = { health, mappings };
  const current = GOOGLE_SETUP_STEPS[stepIndex(step)];

  function complete(then: () => void) {
    setError("");
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction();
        if (!result.ok) {
          setError("No tienes permiso.");
          return;
        }
        then();
      } catch {
        setError("No se pudo guardar. Intenta de nuevo.");
      }
    });
  }

  function goToStep(target: GoogleSetupStepId) {
    setError("");
    setStep(target);
  }

  const body = (
    <>
      <CardContent className="space-y-4">
        {step === "review" ? <ReviewStep health={health} /> : null}
        {step === "admin_group" ? <AdminGroupStep mappings={mappings} domain={domain} /> : null}
        {step === "more_groups" ? <GoogleGroupMappings mappings={mappings} positions={positions} /> : null}
        {step === "done" ? <DoneStep domain={domain} /> : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap justify-between gap-2">
        {step === "done" ? (
          <Button variant="ghost" disabled={isPending} onClick={() => goToStep(previousStep(step))}>
            Atrás
          </Button>
        ) : (
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => complete(() => router.replace("/inicio"))}
          >
            Omitir por ahora
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          {step !== "review" && step !== "done" ? (
            <Button variant="outline" disabled={isPending} onClick={() => goToStep(previousStep(step))}>
              Atrás
            </Button>
          ) : null}
          {step === "done" ? (
            <Button
              disabled={isPending}
              onClick={() => complete(() => window.location.assign(SIGN_OUT_TO_GOOGLE_LOGIN))}
            >
              Cerrar sesión y entrar con Google
            </Button>
          ) : (
            <Button disabled={isPending || !canAdvance(step, state)} onClick={() => goToStep(nextStep(step))}>
              Siguiente
            </Button>
          )}
        </div>
      </CardFooter>
    </>
  );

  // FE §3.10, frame `BienvenidaGoogle`: the stepper sits above the wizard card.
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6" data-wizard="google">
      <WizardStepper steps={GOOGLE_SETUP_STEPS} current={step} />
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{current.label}</CardTitle>
          <CardDescription>{STEP_DESCRIPTIONS[step]}</CardDescription>
        </CardHeader>
        {body}
      </Card>
    </div>
  );
}
