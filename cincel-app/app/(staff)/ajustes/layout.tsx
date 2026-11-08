import type { ReactNode } from "react";

import { AjustesNavFromPath } from "@/components/ajustes/AjustesNavFromPath";
import { PageHeader } from "@/components/shell/PageHeader";
import { isSettingsAdministrator, resolveAjustesSegments } from "@/lib/auth/ajustes-segments";
import { requirePageCapability } from "@/lib/auth/session";

/**
 * Ajustes layout (redesign FE §3.8): header, `AjustesNav` on the left (240 px)
 * and the section page on the right. Personal pages need only a staff session;
 * each Organización segment is guarded by its own `(admin)/<segment>/layout.tsx`.
 * The nav items are resolved here with the same rules as those guards.
 */
export default async function AjustesLayout({ children }: { children: ReactNode }) {
  const user = await requirePageCapability(() => true);
  const segments = resolveAjustesSegments(user);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Ajustes"
        description="Tus preferencias y, si eres administrador, las de la organización."
      />
      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-4 md:self-start">
          <AjustesNavFromPath isAdmin={isSettingsAdministrator(user)} segments={segments} />
        </aside>
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
