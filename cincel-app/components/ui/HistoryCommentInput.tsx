"use client";

import { useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Textarea } from "@/components/ui/shadcn/textarea";

type Props = {
  /** Receives the trimmed text; the input clears once it resolves and keeps the text if it throws. */
  onSubmit: (text: string) => void | Promise<void>;
  /** Called instead of onSubmit when the text is blank. */
  onEmpty?: () => void;
  placeholder: string;
  submitLabel: string;
};

/** Comment box for a bitácora, shared by the task drawer and the project ficha. */
export function HistoryCommentInput({
  onSubmit,
  onEmpty,
  placeholder,
  submitLabel,
}: Props) {
  const [text, setText] = useState("");

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onEmpty?.();
      return;
    }
    try {
      await onSubmit(trimmed);
      setText("");
    } catch {
      // The caller reports the error; keep the text so it can be retried.
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder={placeholder}
        className="text-sm"
      />
      <div className="flex justify-end">
        <Button
          onClick={() => void handleSubmit()}
          className="h-auto rounded-lg px-3 py-2 text-xs font-semibold"
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
