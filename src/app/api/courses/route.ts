import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courses = await prisma.course.findMany({
    where: { userId: session.user.id },
    include: {
      syllabus: true,
      _count: { select: { assignments: true, exams: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(courses);
}
