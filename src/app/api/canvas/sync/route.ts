import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncCanvasForUser, syncGradesForUser } from "@/lib/canvas/sync";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const includeGrades = url.searchParams.get("grades") === "true";

  try {
    const result = await syncCanvasForUser(session.user.id);

    if (includeGrades) {
      await syncGradesForUser(session.user.id);
    }

    return NextResponse.json(result);
  } catch (error) {
    await prisma.syncLog.create({
      data: {
        userId: session.user.id,
        status: "error",
        message: error instanceof Error ? error.message : "Sync failed",
      },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
