import { realAuthEnabled } from "@/lib/auth-demo";
import { LoginForm } from "./login-form";

// The one-click demo accounts only exist in demo mode; with real auth on,
// their seeded passwords are disabled (scripts/set-user-password.ts).
export default function LoginPage() {
  return <LoginForm showDemo={!realAuthEnabled()} />;
}
