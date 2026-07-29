import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scheduleAssignmentBlock } from "@/lib/schedule/assignment-scheduling";
import { z } from "zod";

const assignmentSchema = z.object({
  title: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  points: z.number().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId: session.user.id },
  });
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = assignmentSchema.parse(await req.json());
  const assignment = await prisma.assignment.create({
    data: {
      courseId,
      title: body.title,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      points: body.points ?? null,
      source: "manual",
    },
  });

  if (assignment.dueDate) {
    await scheduleAssignmentBlock(
      session.user.id,
      {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate,
      },
      courseId,
    );
  }

  return NextResponse.json(assignment);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  const assignmentId = req.nextUrl.searchParams.get("assignmentId");
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
  }

  await prisma.assignment.deleteMany({
    where: {
      id: assignmentId,
      courseId,
      course: { userId: session.user.id },
    },
  });

  return NextResponse.json({ ok: true });
}
