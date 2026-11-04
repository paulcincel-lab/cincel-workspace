import "server-only";

import { getSessionAccess } from "@/lib/auth/session";
import {
  firstLoginWizardRoute,
  resolveFirstLoginWizard,
  shouldShowGoogleSetupBanner,
  type FirstLoginWizard,
} from "@/lib/onboarding/first-login";
import * as onboardingRepository from "@/lib/repositories/onboarding-repository";

/** Server side of `first-login.ts`: reads the session and the DB, then applies the pure rules. */

export type FirstLoginState = {
  wizard: FirstLoginWizard | null;
  /** Where the dashboard redirects; null when there is no wizard or its page isn't built. */
  route: string | null;
  /** Dashboard banner: the bootstrap admin skipped the Google wizard and no group is mapped yet. */
  showGoogleSetupBanner: boolean;
};

const NONE: FirstLoginState = { wizard: null, route: null, showGoogleSetupBanner: false };

export async function getFirstLoginState(): Promise<FirstLoginState> {
  const access = await getSessionAccess();
  if (access.status !== "active" || !access.user) return NONE;
  const user = access.user;

  const onboardingCompletedAt = await onboardingRepository.getOnboardingCompletedAt(user.id);
  const wizard = await resolveFirstLoginWizard({
    email: user.email,
    access: user.access,
    googleLinked: user.googleLinked,
    onboardingCompletedAt,
    hasAppliedImport: () => onboardingRepository.hasAppliedImport(),
  });
  if (wizard) return { wizard, route: firstLoginWizardRoute(wizard), showGoogleSetupBanner: false };

  const bannerInput = { email: user.email, access: user.access, onboardingCompletedAt };
  // Count only when every other condition holds, so most dashboards skip the query.
  if (!shouldShowGoogleSetupBanner({ ...bannerInput, groupMappingCount: 0 })) return NONE;
  const groupMappingCount = await onboardingRepository.countGroupMappings();
  return { ...NONE, showGoogleSetupBanner: shouldShowGoogleSetupBanner({ ...bannerInput, groupMappingCount }) };
}
