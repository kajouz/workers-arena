import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSession } from "@/lib/auth-demo";

const prisma = new PrismaClient();

/**
 * GET /api/forum/[id] - Get a forum post with answers
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Increment view count
    await prisma.forumPost.update({
      where: { id },
      data: { views: { increment: 1 } },
    });

    const post = await prisma.forumPost.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, role: true },
        },
        answers: {
          include: {
            author: {
              select: { id: true, name: true, role: true },
            },
          },
          orderBy: [
            { isAccepted: "desc" },
            { upvotes: "desc" },
            { createdAt: "asc" },
          ],
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...post,
      authorName: post.author.name,
      authorRole: post.author.role,
      answers: post.answers.map((a) => ({
        ...a,
        authorName: a.author.name,
        authorRole: a.author.role,
      })),
    });
  } catch (error) {
    console.error("[Forum] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch post" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forum/[id] - Add an answer to a forum post
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Check if post exists and is not locked
    const post = await prisma.forumPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (post.isLocked) {
      return NextResponse.json(
        { error: "This post is locked" },
        { status: 403 }
      );
    }

    // Create answer and increment answer count
    const [answer] = await prisma.$transaction([
      prisma.forumAnswer.create({
        data: {
          postId: id,
          content,
          authorId: session.id,
        },
      }),
      prisma.forumPost.update({
        where: { id },
        data: { answerCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json(answer, { status: 201 });
  } catch (error) {
    console.error("[Forum] POST error:", error);
    return NextResponse.json(
      { error: "Failed to add answer" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/forum/[id] - Update a forum post (author or admin only)
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    const post = await prisma.forumPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Only author or admin can update
    if (post.authorId !== session.id && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.forumPost.update({
      where: { id },
      data: {
        title: body.title ?? undefined,
        content: body.content ?? undefined,
        category: body.category ?? undefined,
        tags: body.tags ?? undefined,
        isPinned: body.isPinned ?? undefined,
        isLocked: body.isLocked ?? undefined,
        isSolved: body.isSolved ?? undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Forum] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/forum/[id] - Delete a forum post (author or admin only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    const post = await prisma.forumPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Only author or admin can delete
    if (post.authorId !== session.id && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.forumPost.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Forum] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 }
    );
  }
}
