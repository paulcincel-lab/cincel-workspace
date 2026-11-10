import type { ReactNode } from "react";

import { AjustesNavFromPath } from "@/components/ajustes/AjustesNavFromPath";
import { PageHeader } from "@/components/shell/PageHeader";
import { isSettingsAdministrator, resolveAjustesSegments } from "@/lib/auth/ajustes-segments";
import { requirePageCapability } from "@/lib/auth/session";

/**
 * Ajustes layout (redesign FE §3.8, canvas `Ajustes-*`): header without the
 * Estilo switch (settings ignore the presentation style), then a wrapping
 * body: `AjustesNav` (220 px; a `Select` "Sección" on narrow screens) and the
 * content column (`flex: 999 1 560px`). Normal page scroll. Personal pages
 * need only a staff session; each Organización segment is guarded by its own
 * `(admin)/<segment>/layout.tsx`. The nav items are resolved here with the
 * same rules as those guards.
 */
export default async function AjustesLayout({ children }: { children: ReactNode }) {
  const user = await requirePageCapability(() => true);
  const segments = resolveAjustesSegments(user);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ajustes" description="Tu cuenta y la configuración del despacho." estilo={false} />
      <div className="flex flex-wrap items-start gap-6">
        <aside className="w-full md:sticky md:top-4 md:w-[220px] md:shrink-0">
          <AjustesNavFromPath isAdmin={isSettingsAdministrator(user)} segments={segments} />
        </aside>
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
