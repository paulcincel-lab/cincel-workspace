"use client";

import type { ReactNode } from "react";

import { StyleView } from "@/components/widgets/StyleView";

/**
 * A page's whole layout per presentation style (ADR 0004): renders only the
 * active branch, with no wrapper element. The style follows `useStyle` (the
 * `?estilo=` override, ignored when the organization fixed the style).
 */
export type PageStyleLayoutProps = { visual: () => ReactNode; esencial: () => ReactNode; analitico: () => ReactNode };

export function PageStyleLayout(props: PageStyleLayoutProps): ReactNode {
  return <StyleView {...props} />;
}
