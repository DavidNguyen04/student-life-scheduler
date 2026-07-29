import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  term: z.string().nullable().optional(),
  color: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const course = await prisma.course.findFirst({
    where: { id, userId: session.user.id },
    include: {
      syllabus: true,
      assignments: { orderBy: { dueDate: "asc" } },
      exams: { orderBy: { dateTime: "asc" } },
      resources: {
        where: { sourceType: { not: "syllabus" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          sourceType: true,
          fileName: true,
          createdAt: true,
        },
      },
    },
  });

  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(course);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = updateSchema.parse(await req.json());

  const course = await prisma.course.updateMany({
    where: { id, userId: session.user.id },
    data: body,
  });

  if (course.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.course.findUnique({ where: { id } });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.course.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
