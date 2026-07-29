import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { chatWithCourse, indexSyllabusForCourse } from "@/lib/rag/index";
import { z } from "zod";

const chatSchema = z.object({
  courseId: z.string(),
  message: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = chatSchema.parse(await req.json());
  const result = await chatWithCourse(body.courseId, body.message);
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId } = await req.json();
  if (!courseId) {
    return NextResponse.json({ error: "courseId required" }, { status: 400 });
  }

  await indexSyllabusForCourse(courseId);
  return NextResponse.json({ ok: true });
}
