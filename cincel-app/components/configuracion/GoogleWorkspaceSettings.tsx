import Link from "next/link";

import { GoogleGroupMappings } from "@/components/configuracion/GoogleGroupMappings";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/shadcn/breadcrumb";
import type { GroupMapping } from "@/lib/types/workspace-access";

export type GoogleWorkspaceSettingsProps = {
  mappings: GroupMapping[];
  areas: { id: string; name: string }[];
};

/** Configuración → Google (FE §2.5): breadcrumb and banner, then its sections in order. */
export function GoogleWorkspaceSettings({ mappings, areas }: GoogleWorkspaceSettingsProps) {
  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/configuracion" />}>Configuración</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Google</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Alert>
        <AlertDescription>Los roles y las áreas se administran en grupos de Google Workspace.</AlertDescription>
      </Alert>

      <GoogleGroupMappings mappings={mappings} areas={areas} />
    </div>
  );
}
