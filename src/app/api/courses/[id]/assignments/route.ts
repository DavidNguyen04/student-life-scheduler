import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const assignmentSchema = z.object({
  title: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  points: z.number().nullable().optional(),
});

const updateAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
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

  return NextResponse.json(assignment);
}

export async function PATCH(
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

  const body = updateAssignmentSchema.parse(await req.json());
  const assignment = await prisma.assignment.updateMany({
    where: {
      id: assignmentId,
      courseId,
      course: { userId: session.user.id },
    },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.dueDate !== undefined
        ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
        : {}),
      ...(body.points !== undefined ? { points: body.points } : {}),
    },
  });

  if (assignment.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.assignment.findFirst({
    where: { id: assignmentId, courseId },
  });

  return NextResponse.json(updated);
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
