import type { ReactNode } from "react";

/**
 * Test double of `FormSheet` / `FormDialog` for the Mis vacaciones tests: the
 * shell is the pattern's concern, here it only shows the fields, the inline
 * error it is handed and the submit button.
 */
export function FormShellDouble(props: {
  title: string;
  open: boolean;
  onSubmit(): Promise<void>;
  submitLabel: string;
  error?: string | null;
  children: ReactNode;
}) {
  return props.open ? (
    <div role="dialog" aria-label={props.title}>
      {props.children}
      {props.error ? <div role="alert">{props.error}</div> : null}
      <button type="button" onClick={() => void props.onSubmit()}>
        {props.submitLabel}
      </button>
    </div>
  ) : null;
}
