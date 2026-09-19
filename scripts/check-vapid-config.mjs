const required = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];

if (process.env.DEMO_MODE !== "false") {
  console.log("VAPID check: demo mode — production keys are not required.");
  process.exit(0);
}

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`VAPID check failed: missing ${missing.join(", ")}`);
  process.exit(1);
}

if (!/^mailto:|^https?:\/\//i.test(process.env.VAPID_SUBJECT)) {
  console.error("VAPID check failed: VAPID_SUBJECT must be a mailto: or https:// URL.");
  process.exit(1);
}

console.log("VAPID check: complete production configuration detected.");
