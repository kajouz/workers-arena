import { NextResponse } from "next/server";
import { getSession, realAuthEnabled } from "@/lib/auth-demo";

export async function POST(request: Request) {
  // Verify admin session
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 401 });
  }

  const body = await request.json();
  const { name, email, password, phone, role } = body;

  // Validate
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const userRole = role === "worker" ? "WORKER" : role === "company" ? "COMPANY" : "CUSTOMER";

  if (realAuthEnabled()) {
    try {
      const { getPrisma } = await import("@/lib/server/prisma");
      const { hashPassword } = await import("@/lib/security");
      const prisma = getPrisma();

      // Check if email already exists
      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (existing) {
        return NextResponse.json({ error: "Email already exists" }, { status: 409 });
      }

      const user = await prisma.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          passwordHash: hashPassword(password),
          phone: phone || null,
          role: userRole,
          locale: "en",
          hue: Math.floor(Math.random() * 360),
        },
      });

      return NextResponse.json({
        success: true,
        customer: { id: user.id, name: user.name, email: user.email },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: "Email already exists" }, { status: 409 });
      }
      console.error("Failed to create customer:", e);
      return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }
  }

  // Demo mode
  return NextResponse.json({
    success: true,
    customer: { id: `u-${Date.now()}`, name, email },
  });
}
