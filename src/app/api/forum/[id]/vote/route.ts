import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getSession } from "@/lib/auth-demo";

const prisma = new PrismaClient();

/**
 * POST /api/forum/[id]/vote - Vote on a post or answer
 * Body: { targetType: "post" | "answer", targetId: string, value: 1 | -1 }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { targetType, targetId, value } = body;

    if (!targetType || !targetId || (value !== 1 && value !== -1)) {
      return NextResponse.json(
        { error: "Invalid vote data" },
        { status: 400 }
      );
    }

    // Check for existing vote
    const existingVote = await prisma.forumVote.findUnique({
      where: {
        userId_targetType_targetId: {
          userId: session.id,
          targetType,
          targetId,
        },
      },
    });

    if (existingVote) {
      // Toggle vote if same value, otherwise update
      if (existingVote.value === value) {
        // Remove vote
        await prisma.forumVote.delete({
          where: { id: existingVote.id },
        });

        // Decrement count
        const field = value === 1 ? "upvotes" : "downvotes";
        if (targetType === "post") {
          await prisma.forumPost.update({
            where: { id: targetId },
            data: { [field]: { decrement: 1 } },
          });
        } else {
          await prisma.forumAnswer.update({
            where: { id: targetId },
            data: { [field]: { decrement: 1 } },
          });
        }

        return NextResponse.json({ success: true, action: "removed" });
      }

      // Update vote
      await prisma.forumVote.update({
        where: { id: existingVote.id },
        data: { value },
      });

      // Update counts
      const oldField = existingVote.value === 1 ? "upvotes" : "downvotes";
      const newField = value === 1 ? "upvotes" : "downvotes";

      if (targetType === "post") {
        await prisma.forumPost.update({
          where: { id: targetId },
          data: { [oldField]: { decrement: 1 }, [newField]: { increment: 1 } },
        });
      } else {
        await prisma.forumAnswer.update({
          where: { id: targetId },
          data: { [oldField]: { decrement: 1 }, [newField]: { increment: 1 } },
        });
      }

      return NextResponse.json({ success: true, action: "updated" });
    }

    // Create new vote
    await prisma.forumVote.create({
      data: {
        userId: session.id,
        targetType,
        targetId,
        value,
      },
    });

    // Increment count
    const field = value === 1 ? "upvotes" : "downvotes";

    if (targetType === "post") {
      await prisma.forumPost.update({
        where: { id: targetId },
        data: { [field]: { increment: 1 } },
      });
    } else {
      await prisma.forumAnswer.update({
        where: { id: targetId },
        data: { [field]: { increment: 1 } },
      });
    }

    return NextResponse.json({ success: true, action: "created" });
  } catch (error) {
    console.error("[Forum] Vote error:", error);
    return NextResponse.json(
      { error: "Failed to vote" },
      { status: 500 }
    );
  }
}
