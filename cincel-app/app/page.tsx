import { redirect } from "next/navigation";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function Home({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/", searchParams);
  redirect("/dashboard");
}