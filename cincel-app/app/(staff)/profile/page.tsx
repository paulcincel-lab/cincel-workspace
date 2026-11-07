import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/profile", searchParams);
  return <ProfileClient />;
}
