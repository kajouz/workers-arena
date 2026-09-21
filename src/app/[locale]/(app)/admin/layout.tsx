import { getSession } from "@/lib/auth-demo";
import { localeRedirect } from "@/lib/i18n/redirect";

/**
 * Segment guard for every /admin/* route.
 *
 * Before this existed each admin page guarded itself, and 23 of the 34 did
 * not — /admin/settings, /admin/logs, /admin/customers, /admin/webhooks and
 * the rest rendered the admin console to anyone who typed the URL. The live
 * platform data behind those screens was never exposed (it arrives through
 * /api/admin/* and /api/calling/admin, which all check the admin role), but
 * the console itself — the internal tooling inventory, the operational
 * vocabulary, the shape of the back office — was public.
 *
 * One guard on the segment closes the whole class and stops the next admin
 * page from having to remember.
 *
 * NOT the only boundary, by design: a layout is re-executed on full document
 * requests and on segment changes, but a client-side navigation WITHIN this
 * segment reuses it. It is a gate at the door, not a check on every room, so
 * the pages that read data server-side keep their own `getSession()` calls
 * and every /api/admin/* handler keeps its own check. Defence in depth is the
 * point — never delete a page's guard because this file exists.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "admin") return await localeRedirect("/dashboard");
  return <>{children}</>;
}
