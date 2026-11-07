import type { ReactNode } from "react";

/**
 * Minimal stand-ins for the `SettingsSection` / `SettingsRow` patterns in the
 * Ajustes › General tests: same props and semantics (labelled section, label
 * bound to its control), so the tests exercise the page, not the pattern.
 */
export function TestSettingsSection({
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
  const id = `section-${title.replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions}
      {children}
    </section>
  );
}

export function TestSettingsRow({
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
  return (
    <div>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {description ? <p>{description}</p> : null}
      {htmlFor ? control : <div role="group" aria-label={label}>{control}</div>}
    </div>
  );
}
