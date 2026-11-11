import type { ReactNode } from "react";

/**
 * Contract-phase body of a Calendario widget: a labelled `<section>` with the
 * titles it was given. The owning issue replaces each widget's markup; it never throws.
 */
export function CalendarioStubSection({ label, titles = [], children }: { label: string; titles?: readonly string[]; children?: ReactNode }) {
  return (
    <section aria-label={label} data-slot="calendario-stub">
      {titles.length > 0 ? (
        <ul>
          {titles.map((title, index) => (
            <li key={`${index}:${title}`}>{title}</li>
          ))}
        </ul>
      ) : null}
      {children}
    </section>
  );
}
