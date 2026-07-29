import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseSyllabusText } from "@/lib/syllabus/parser";
import { z } from "zod";

const reuploadSchema = z.object({
  content: z.string().min(1),
  sourceType: z.enum(["html", "text"]),
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

  const body = reuploadSchema.parse(await req.json());
  const parsed = parseSyllabusText(body.content, body.sourceType);

  await prisma.syllabus.upsert({
    where: { courseId },
    create: {
      courseId,
      sourceType: body.sourceType,
      rawContent: body.content,
      parsedAt: new Date(),
    },
    update: {
      sourceType: body.sourceType,
      rawContent: body.content,
      parsedAt: new Date(),
    },
  });

  return NextResponse.json(parsed);
}
