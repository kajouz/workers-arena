import { connection } from "next/server";
import { realAuthEnabled } from "@/lib/auth-demo";
import { LoginForm } from "./login-form";

// The one-click demo accounts only exist in demo mode; with real auth on,
// their seeded passwords are disabled (scripts/set-user-password.ts).
// Decided per request: a prerendered page would bake in the build
// environment's mode instead of the running deployment's.
export default async function LoginPage() {
  await connection();
  return <LoginForm showDemo={!realAuthEnabled()} />;
}
