import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractTextFromUpload } from "@/lib/syllabus/parser";
import { indexCourseContent } from "@/lib/rag/index";
import { z } from "zod";

export const runtime = "nodejs";

const textUploadSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  sourceType: z.enum(["html", "text"]).default("text"),
});

async function getOwnedCourse(courseId: string, userId: string) {
  return prisma.course.findFirst({
    where: { id: courseId, userId },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  const course = await getOwnedCourse(courseId, session.user.id);
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resources = await prisma.courseResource.findMany({
    where: { courseId, sourceType: { not: "syllabus" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceType: true,
      fileName: true,
      createdAt: true,
      content: true,
    },
  });

  return NextResponse.json(
    resources.map(({ content, ...resource }) => ({
      ...resource,
      preview: content.slice(0, 200),
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  const course = await getOwnedCourse(courseId, session.user.id);
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const title = (formData.get("title") as string | null)?.trim();

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { text, sourceType } = await extractTextFromUpload(buffer, file.name);
      if (!text.trim()) {
        return NextResponse.json(
          { error: "Could not extract text from file." },
          { status: 400 },
        );
      }

      const resource = await indexCourseContent(
        courseId,
        title || file.name.replace(/\.[^.]+$/, ""),
        text,
        sourceType,
        file.name,
      );

      return NextResponse.json({
        id: resource.id,
        title: resource.title,
        sourceType: resource.sourceType,
        fileName: file.name,
      });
    }

    const body = textUploadSchema.parse(await req.json());
    const resource = await indexCourseContent(
      courseId,
      body.title,
      body.content,
      body.sourceType,
    );

    return NextResponse.json({
      id: resource.id,
      title: resource.title,
      sourceType: resource.sourceType,
      fileName: null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
