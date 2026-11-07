import type { ReactNode } from "react";

/**
 * Auth layouts of the redesign (FE §3.10; canvas `Login`, `LoginDenegado`,
 * `CambioContrasena`). Server-safe, colors from theme tokens only, and no
 * presentation-style branching: auth pages ignore Visual / Esencial / Analítico
 * (FE §15.3).
 *
 * - `AuthSplitLayout`: brand panel (left, CSS-shape pattern, no images) and the
 *   form column (right). Stacks under `lg`, with the pattern hidden on phones.
 * - `AuthCenteredLayout`: the brand lockup above one centered card (denied page).
 */

/** "C" tile + CINCEL / Workspace wordmark. */
export function BrandLockup({ tone = "panel" }: { tone?: "panel" | "page" }) {
  const panel = tone === "panel";
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={
          panel
            ? "inline-flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-lg font-semibold text-sidebar-primary-foreground"
            : "inline-flex size-8 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground"
        }
      >
        C
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-[0.24em]">CINCEL</span>
        {panel ? <span className="text-sm text-sidebar-foreground">Workspace</span> : null}
      </span>
    </div>
  );
}

/** Floor-plan style grid of outlined and filled blocks (pure CSS, decorative). */
const PATTERN_BLOCKS: readonly { area: string; kind: "line" | "accent" | "fill" | "dashed" }[] = [
  { area: "col-start-1 col-end-3 row-start-1 row-end-3", kind: "line" },
  { area: "col-start-3 col-end-5 row-start-1 row-end-2", kind: "line" },
  { area: "col-start-5 col-end-7 row-start-1 row-end-4", kind: "accent" },
  { area: "col-start-3 col-end-4 row-start-2 row-end-4", kind: "fill" },
  { area: "col-start-4 col-end-5 row-start-2 row-end-3", kind: "line" },
  { area: "col-start-1 col-end-2 row-start-3 row-end-5", kind: "line" },
  { area: "col-start-2 col-end-3 row-start-3 row-end-4", kind: "fill" },
  { area: "col-start-4 col-end-7 row-start-4 row-end-5", kind: "line" },
  { area: "col-start-2 col-end-4 row-start-4 row-end-5", kind: "dashed" },
];

const BLOCK_CLASS: Record<(typeof PATTERN_BLOCKS)[number]["kind"], string> = {
  line: "rounded-md border-[1.5px] border-sidebar-border",
  accent: "rounded-md border-[1.5px] border-sidebar-primary",
  fill: "rounded-md bg-sidebar-accent",
  dashed: "rounded-md border-[1.5px] border-dashed border-sidebar-border",
};

export function BrandPattern() {
  return (
    <div
      aria-hidden="true"
      data-testid="auth-brand-pattern"
      className="hidden max-w-[520px] grid-cols-6 grid-rows-[repeat(4,64px)] gap-2.5 sm:grid"
    >
      {PATTERN_BLOCKS.map((block) => (
        <span key={block.area} className={`${block.area} ${BLOCK_CLASS[block.kind]}`} />
      ))}
    </div>
  );
}

export type AuthSplitLayoutProps = {
  children: ReactNode;
  /** Optional line under the form card (e.g. the version). */
  footer?: ReactNode;
};

export function AuthSplitLayout({ children, footer }: AuthSplitLayoutProps) {
  return (
    <div data-testid="auth-split-layout" className="flex min-h-svh flex-col bg-background text-foreground lg:flex-row">
      <section
        aria-label="Cincel Workspace"
        className="flex flex-col justify-between gap-10 bg-sidebar px-6 py-8 text-sidebar-foreground sm:px-12 sm:py-12 lg:min-h-svh lg:flex-1"
      >
        <BrandLockup />
        <BrandPattern />
        <div className="flex max-w-[460px] flex-col gap-2.5">
          <p className="text-2xl leading-tight font-semibold tracking-tight sm:text-[28px]">
            Proyectos, obra y equipo en un solo lugar.
          </p>
          <p className="text-[15px] leading-relaxed">
            Tareas, cronogramas, archivos y mensajes del despacho, desde Presale hasta Decoración.
          </p>
        </div>
      </section>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-[400px]">{children}</div>
        {footer}
      </main>
    </div>
  );
}

export function AuthCenteredLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="auth-centered-layout"
      className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-foreground sm:px-6 sm:py-12"
    >
      <BrandLockup tone="page" />
      <main className="w-full max-w-[440px]">{children}</main>
    </div>
  );
}
