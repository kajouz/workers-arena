import { getSession } from "@/lib/auth-demo";
import { localeRedirect } from "@/lib/i18n/redirect";

/**
 * Segment guard for every /company/* route — the advertiser console
 * (campaigns, budgets, invoices). Mirrors the role rule the segment's page
 * already applies, so a page added here later inherits it instead of having
 * to remember it.
 *
 * Admins are allowed through: the advertiser console is also how support
 * inspects a campaign dispute.
 */
export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "company" && session.role !== "admin") return await localeRedirect("/dashboard");
  return <>{children}</>;
}
