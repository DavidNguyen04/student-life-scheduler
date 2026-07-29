import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/canvas/crypto";
import { CanvasClient } from "@/lib/canvas/client";
import { z } from "zod";

const connectSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(10),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.canvasConnection.findUnique({
    where: { userId: session.user.id },
    select: { baseUrl: true, updatedAt: true },
  });

  return NextResponse.json({ connected: !!connection, connection });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = connectSchema.parse(await req.json());
  const client = new CanvasClient(body.baseUrl, body.token);
  await client.testConnection();

  await prisma.canvasConnection.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      baseUrl: body.baseUrl.replace(/\/$/, ""),
      encryptedToken: encryptToken(body.token),
    },
    update: {
      baseUrl: body.baseUrl.replace(/\/$/, ""),
      encryptedToken: encryptToken(body.token),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.canvasConnection.deleteMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
