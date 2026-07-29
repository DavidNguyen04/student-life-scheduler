import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const examSchema = z.object({
  title: z.string().min(1),
  dateTime: z.string(),
  location: z.string().nullable().optional(),
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

  const body = examSchema.parse(await req.json());
  const exam = await prisma.exam.create({
    data: {
      courseId,
      title: body.title,
      dateTime: new Date(body.dateTime),
      location: body.location ?? null,
      source: "manual",
    },
  });

  return NextResponse.json(exam);
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
  const examId = req.nextUrl.searchParams.get("examId");
  if (!examId) {
    return NextResponse.json({ error: "examId required" }, { status: 400 });
  }

  await prisma.exam.deleteMany({
    where: {
      id: examId,
      courseId,
      course: { userId: session.user.id },
    },
  });

  return NextResponse.json({ ok: true });
}
