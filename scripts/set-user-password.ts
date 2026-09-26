/**
 * Set or disable a user's password against the database in DATABASE_URL.
 *
 *   npx tsx scripts/set-user-password.ts admin@workersarena.com   # prompts, input hidden
 *   npx tsx scripts/set-user-password.ts --disable-demo           # random hash on the 4 seeded demo users
 *
 * The seeded demo identities share DEMO_PASSWORD, which is public in this
 * repo. On a production database run --disable-demo right after `db:seed`,
 * then give the admin a real password with the first form.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security";

const DEMO_EMAILS = [
  "sara@example.com",
  "khaled@plumbfix.lb",
  "ads@buildco.lb",
  "admin@workersarena.com",
];

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("Run this in an interactive terminal (the password is read from the keyboard)."));
      return;
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(130);
      } else if (ch === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/set-user-password.ts <email> | --disable-demo");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    if (arg === "--disable-demo") {
      for (const email of DEMO_EMAILS) {
        const { count } = await prisma.user.updateMany({
          where: { email },
          data: { passwordHash: hashPassword(randomBytes(32).toString("hex")) },
        });
        console.log(`  ${count ? "✓ disabled" : "- not found"}  ${email}`);
      }
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: arg } });
    if (!user) throw new Error(`No user with email ${arg}`);
    const password = await promptHidden(`New password for ${arg}: `);
    if (password.length < 12) throw new Error("Use at least 12 characters.");
    const confirm = await promptHidden("Repeat it: ");
    if (confirm !== password) throw new Error("The two entries don't match.");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } });
    console.log(`✓ Password updated for ${arg} (${user.role})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
