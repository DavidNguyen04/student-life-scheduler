import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, resourceId } = await params;
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId: session.user.id },
  });
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resource = await prisma.courseResource.findFirst({
    where: { id: resourceId, courseId, sourceType: { not: "syllabus" } },
  });
  if (!resource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.resourceChunk.deleteMany({ where: { resourceId } });
  await prisma.courseResource.delete({ where: { id: resourceId } });

  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; resourceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, resourceId } = await params;
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId: session.user.id },
  });
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resource = await prisma.courseResource.findFirst({
    where: { id: resourceId, courseId, sourceType: { not: "syllabus" } },
    select: {
      id: true,
      title: true,
      content: true,
      sourceType: true,
      fileName: true,
      createdAt: true,
    },
  });
  if (!resource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(resource);
}
