import PortalLoginForm from "@/components/portal/PortalLoginForm";
import { getPortalAppearance } from "@/lib/portal/appearance";

type PortalLoginPageProps = {
  searchParams: Promise<{ error?: string | string[]; email?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `/portal/login` (issue 534): public; `?error=link` comes from a used or expired link, `?email=` prefills the field. */
export default async function PortalLoginPage({ searchParams }: PortalLoginPageProps) {
  const [params, appearance] = await Promise.all([searchParams, getPortalAppearance()]);
  return (
    <PortalLoginForm
      linkError={first(params.error) === "link"}
      initialEmail={first(params.email) ?? ""}
      redesign={appearance.redesignEnabled}
    />
  );
}
