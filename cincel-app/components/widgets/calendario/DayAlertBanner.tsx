import type { ReactNode } from "react";

import { CalendarioStubSection } from "./stub-section";

export type DayAlertBannerProps = {
  kind: "overload" | "overlap";
  date: string;
  message?: ReactNode;
  onAction?(): void;
};

/** Banner for an overloaded day or overlapping meetings. Markup belongs to Phase 5. */
export function DayAlertBanner({ kind, message }: DayAlertBannerProps) {
  return <CalendarioStubSection label={kind === "overload" ? "Día sobrecargado" : "Reuniones que se traslapan"}>{message}</CalendarioStubSection>;
}
