"use client";

import { useId, useState } from "react";
import { CheckIcon, CircleAlertIcon, XIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { summarizeToolCall } from "@/lib/assistant/tool-summaries";
import { actionErrorText } from "@/lib/errors";

export type ConfirmationCardProps = {
  part: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    state: "approval-requested" | "output-available" | "output-denied" | "output-error";
    approvalId: string;
    errorText?: string;
  };
  /** Calls `addToolApprovalResponse({ id: approvalId, approved })`. */
  onRespond(approved: boolean): void;
};

/** Labels (FE §3.9, §13). */
export const CONFIRMATION_LABELS = {
  title: "¿Confirmas esta acción?",
  confirm: "Confirmar",
  cancel: "Cancelar",
  done: "Hecho",
  cancelled: "Cancelado",
} as const;

/**
 * `render_confirmation` (redesign FE §3.9, §4.9): renders the native approval
 * request of a tool part; the summary is `toolSummaries[toolName](input)`
 * from `lib/assistant/tool-summaries.ts`. After the response the part moves
 * to `output-available` ("Hecho"), `output-denied` ("Cancelado") or
 * `output-error` (copy from `actionErrorText`).
 */
export function ConfirmationCard({ part, onRespond }: ConfirmationCardProps) {
  const titleId = useId();
  const summary = summarizeToolCall(part.toolName, part.input);
  // Buttons lock after the first click so the approval is sent once while the
  // chat resubmits and the part leaves `approval-requested`.
  const [responded, setResponded] = useState(false);

  function respond(approved: boolean) {
    if (responded) return;
    setResponded(true);
    onRespond(approved);
  }

  return (
    <Card
      size="sm"
      role="group"
      aria-labelledby={titleId}
      data-tool-call-id={part.toolCallId}
      data-state={part.state}
    >
      <CardHeader>
        <CardTitle id={titleId}>{CONFIRMATION_LABELS.title}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      {part.state === "approval-requested" ? (
        <CardFooter>
          <div className="flex gap-2">
            <Button type="button" onClick={() => respond(true)} disabled={responded}>
              {CONFIRMATION_LABELS.confirm}
            </Button>
            <Button type="button" variant="outline" onClick={() => respond(false)} disabled={responded}>
              {CONFIRMATION_LABELS.cancel}
            </Button>
          </div>
        </CardFooter>
      ) : (
        <CardContent>
          <ConfirmationResult state={part.state} errorText={part.errorText} />
        </CardContent>
      )}
    </Card>
  );
}

function ConfirmationResult({
  state,
  errorText,
}: {
  state: "output-available" | "output-denied" | "output-error";
  errorText?: string;
}) {
  if (state === "output-error") {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertDescription>{actionErrorText(errorText ?? "")}</AlertDescription>
      </Alert>
    );
  }
  const done = state === "output-available";
  const Icon = done ? CheckIcon : XIcon;
  return (
    <p role="status" className="flex items-center gap-1.5 text-muted-foreground">
      <Icon aria-hidden="true" className="size-4" />
      {done ? CONFIRMATION_LABELS.done : CONFIRMATION_LABELS.cancelled}
    </p>
  );
}
