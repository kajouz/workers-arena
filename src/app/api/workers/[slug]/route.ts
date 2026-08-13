import { NextRequest, NextResponse } from "next/server";
import { getWorkerBySlug } from "@/lib/data/repo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const worker = await getWorkerBySlug(slug);
  if (!worker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(worker);
}
