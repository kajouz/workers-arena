import { NextRequest, NextResponse } from "next/server";
import { getSuggestionsList } from "@/lib/data/repo";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const locale = request.nextUrl.searchParams.get("locale") === "ar" ? "ar" : "en";
  if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });
  const suggestions = await getSuggestionsList(q, locale);
  return NextResponse.json({ suggestions });
}
