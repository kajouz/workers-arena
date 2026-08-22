"use server";

import { z } from "zod";
import { getSession, realAuthEnabled } from "@/lib/auth-demo";
import { hashPassword } from "@/lib/security";

const addCustomerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(8, "Phone must be at least 8 characters").optional(),
  role: z.enum(["customer", "worker", "company"]).default("customer"),
});

export type AddCustomerState = {
  error?: string;
  success?: boolean;
  customer?: {
    id: string;
    name: string;
    email: string;
  };
};

export async function addCustomerAction(
  _prev: AddCustomerState,
  formData: FormData
): Promise<AddCustomerState> {
  // Verify admin session
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { error: "Unauthorized: Admin access required" };
  }

  const parsed = addCustomerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role") || "customer",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message || "Invalid input" };
  }

  if (realAuthEnabled()) {
    // Create real user in database
    try {
      const { getPrisma } = await import("@/lib/server/prisma");
      const prisma = getPrisma();

      // Check if email already exists
      const existing = await prisma.user.findUnique({
        where: { email: parsed.data.email.toLowerCase() },
      });
      if (existing) {
        return { error: "Email already exists" };
      }

      // Create the user
      const user = await prisma.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          passwordHash: hashPassword(parsed.data.password),
          phone: parsed.data.phone ?? null,
          role: parsed.data.role.toUpperCase() as "CUSTOMER" | "WORKER" | "COMPANY",
          locale: "en",
          hue: Math.floor(Math.random() * 360),
        },
      });

      return {
        success: true,
        customer: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      };
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") {
        return { error: "Email already exists" };
      }
      console.error("Failed to create customer:", e);
      return { error: "Failed to create customer" };
    }
  }

  // Demo mode — return success without persistence
  return {
    success: true,
    customer: {
      id: `u-${Date.now()}`,
      name: parsed.data.name,
      email: parsed.data.email,
    },
  };
}
