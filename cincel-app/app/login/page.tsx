import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";
import RedesignLoginForm from "@/components/auth/RedesignLoginForm";
import { isAuthRedesignOn } from "@/lib/auth/auth-appearance";
import { getAuthFlags } from "@/lib/auth/auth-flags";
import { parseLoginCallbackError } from "@/lib/auth/login-callback-error";
import { getSessionAccess } from "@/lib/auth/session";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

/**
 * Staff login (frontend spec §2.1, backend spec §A.5.1). Flags are read here on
 * the server and passed down as props; an `active` session goes straight to the
 * dashboard (the middleware no longer does this for any request with a cookie).
 *
 * Look (redesign FE §3.10, §18 item 17): a caller with a user row (a session
 * that is not active yet) follows its resolved flag; without a session the org
 * setting decides (`redesignAvailable && redesignDefault`). Both forms share
 * the same sign-in logic.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const access = await getSessionAccess();
  if (access.status === "active") {
    redirect("/dashboard");
  }

  const { googleEnabled, passwordEnabled } = getAuthFlags();
  const { error } = await searchParams;
  const redesign = access.user ? (await getResolvedAppearance()).redesignEnabled : await isAuthRedesignOn();
  const Form = redesign ? RedesignLoginForm : LoginForm;

  return (
    <Form
      googleEnabled={googleEnabled}
      passwordEnabled={passwordEnabled}
      callbackError={parseLoginCallbackError(error)}
    />
  );
}
