/**
 * Test stand-ins for the settings patterns (`SettingsSection`, `SettingsRow`,
 * `FormDialog`, redesign FE §4.11) with the same props and the same
 * accessible structure as the contract: a labelled `<section>` with an h2,
 * rows whose label is bound to the control (`htmlFor`) or names a `group`,
 * and a dialog holding one `<form>` with "Cancelar" + submit and the error
 * shown inline. Page tests mock the pattern modules with these, so they check
 * the page's own markup and behavior; the patterns have their own tests.
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { actionErrorText } from "@/lib/errors";

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} data-slot="settings-section">
      <h2 id={`${id}-title`}>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div data-slot="settings-section-actions">{actions}</div> : null}
      <div>{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  control,
  htmlFor,
}: {
  label: string;
  description?: string;
  control: ReactNode;
  htmlFor?: string;
}) {
  const id = useId();
  return (
    <div data-slot="settings-row">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span id={`${id}-label`}>{label}</span>}
      {description ? <p>{description}</p> : null}
      {htmlFor ? <div>{control}</div> : <div role="group" aria-labelledby={`${id}-label`}>{control}</div>}
    </div>
  );
}

export function FormDialog({
  title,
  description,
  open,
  onOpenChange,
  onSubmit,
  submitLabel,
  pending = false,
  error = null,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange(o: boolean): void;
  onSubmit(): Promise<void>;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await onSubmit();
    } catch (err) {
      setSubmitError(actionErrorText(err));
    }
  }

  const copy = submitError ?? error;
  return (
    <div role="dialog" aria-modal="true" aria-label={title}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
        {copy ? <p role="alert">{copy}</p> : null}
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancelar
        </button>
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
