"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Esencial soft card (ADR 0005): title, meta, action and its rows. Minimal
 * markup for now. Full behavior in #983.
 */
export type EsencialCardProps = {
  title: string;
  href?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  completed?: { count: number; children: ReactNode };
  padding?: "md" | "lg";
  headingLevel?: 2 | 3;
  index?: number;
};

export function EsencialCard({ title, href, meta, action, children, headingLevel = 2 }: EsencialCardProps): ReactNode {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section aria-label={title}>
      <Heading>{href ? <Link href={href}>{title}</Link> : title}</Heading>
      {meta ? <div>{meta}</div> : null}
      {action}
      {children}
    </section>
  );
}
