"use client";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { CalendarioSkeleton } from "@/components/widgets/route-skeletons";

/** /calendario loading state: the skeleton of the active Estilo (grid, cards, or KPIs and table). */
export default function CalendarioLoading() {
  return (
    <PageStyleLayout
      visual={() => <CalendarioSkeleton variant="visual" />}
      esencial={() => <CalendarioSkeleton variant="esencial" />}
      analitico={() => <CalendarioSkeleton variant="analitico" />}
    />
  );
}
