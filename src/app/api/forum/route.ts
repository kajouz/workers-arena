import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSession } from "@/lib/auth-demo";

const prisma = new PrismaClient();

/**
 * GET /api/forum - List forum posts with filtering
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("q");
    const sort = searchParams.get("sort") ?? "newest";
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const offset = (page - 1) * limit;

    const where: any = {};
    if (category && category !== "all") {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    const orderBy: any = (() => {
      switch (sort) {
        case "popular":
          return { upvotes: "desc" };
        case "unanswered":
          return { answerCount: "asc" };
        case "newest":
        default:
          return { createdAt: "desc" };
      }
    })();

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          author: {
            select: { id: true, name: true, role: true },
          },
          _count: {
            select: { answers: true },
          },
        },
      }),
      prisma.forumPost.count({ where }),
    ]);

    return NextResponse.json({
      posts: posts.map((p) => ({
        ...p,
        authorName: p.author.name,
        authorRole: p.author.role,
        answerCount: p._count.answers,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[Forum] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forum - Create a new forum post
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, content, category, tags } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    const post = await prisma.forumPost.create({
      data: {
        title,
        content,
        category: category ?? "general",
        tags: tags ?? [],
        authorId: session.id,
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error("[Forum] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
