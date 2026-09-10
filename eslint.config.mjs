// ─────────────────────────────────────────────────────────────────────────────
// ESLint flat config (ESLint 9+) — Next.js recommended rules + Web Vitals.
//
// The Next.js config is NOT type-aware (no projectService), so linting stays
// fast and needs no tsconfig wiring — `npm run typecheck` owns type safety,
// ESLint owns style/correctness.
//
// Ignore lists mirror .gitignore (build artifacts, generated platforms, and
// runtime data must never be linted).
// ─────────────────────────────────────────────────────────────────────────────
import nextVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next scopes its plugin registrations to its own config blocks,
// and ESLint 9 rejects re-registering a plugin name from a separate block.
// So rule overrides are applied in place, on the very blocks that declare the
// plugins they reference.
for (const block of nextVitals) {
  // ── React Compiler-era rules (react-hooks v6) ──────────────────────────
  // These flag long-standing patterns across ~100 call sites (state set
  // inside effects, impure helpers, in-place mutations). Enabling them as
  // errors today would block the whole repo; they're tracked debt — keep
  // them visible as warnings and burn them down incrementally. See
  // `npm run lint:strict` (fails on any warning) once the debt is paid.
  if (block.plugins?.["react-hooks"]) {
    block.rules = {
      ...block.rules,
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    };
  }
  // ── Navigation from non-React code ─────────────────────────────────────
  // Voice commands, Capacitor deep-link handlers and push-notification taps
  // run outside component handlers, where useRouter().push() isn't
  // reachable — window.location is the only option there.
  if (block.plugins?.["@next/next"]) {
    block.rules = {
      ...block.rules,
      "@next/next/no-location-assign-relative-destination": "warn",
    };
  }
}

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "next-env.d.ts",
      "ios/**",
      "android/**",
      "test-results/**",
      "meili_data/**",
      ".data/**",
      "tmp/**",
      "public/**",
    ],
  },
];

export default eslintConfig;