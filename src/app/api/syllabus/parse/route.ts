import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  extractTextFromPdf,
  parseSyllabusText,
} from "@/lib/syllabus/parser";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractTextFromPdf(buffer);
      const parsed = parseSyllabusText(text, "pdf");

      return NextResponse.json({
        ...parsed,
        sourceType: "pdf",
        fileName: file.name,
      });
    }

    const body = await req.json();
    const { content, sourceType } = body as {
      content: string;
      sourceType: "html" | "text";
    };

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }

    const parsed = parseSyllabusText(content, sourceType ?? "text");
    return NextResponse.json({ ...parsed, sourceType: sourceType ?? "text" });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Parse failed" },
      { status: 500 },
    );
  }
}
