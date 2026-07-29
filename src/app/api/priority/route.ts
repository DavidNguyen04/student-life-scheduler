import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { prioritizeAssignments } from "@/lib/priority/engine";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      course: { userId: session.user.id },
      dueDate: { gte: new Date() },
    },
    include: {
      course: {
        select: {
          id: true,
          name: true,
          color: true,
          currentScore: true,
          currentGrade: true,
        },
      },
    },
  });

  return NextResponse.json(prioritizeAssignments(assignments));
}
