import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";

/**
 * Segment guard for every /dashboard/* route.
 *
 * Deliberately only requires a SESSION, not a role. The pages in this segment
 * disagree about roles on purpose: most redirect an admin to /admin and a
 * company to /company, but /dashboard/onboarding accepts any signed-in user
 * (that is how a customer or company account becomes a worker). Hoisting a
 * role check here would break that flow, so the role-specific redirects stay
 * on the pages that mean them and this layout enforces the one rule they all
 * share — nobody anonymous gets in.
 *
 * Every page in this segment currently guards itself too. That is intentional
 * (see the note in src/app/admin/layout.tsx on why a layout is a gate at the
 * door rather than a check on every room); this file is the floor, not a
 * replacement.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  return <>{children}</>;
}
