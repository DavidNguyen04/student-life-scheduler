import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseCalendarLegend,
  type CalendarLegendSettings,
  type LegendEventType,
} from "@/lib/schedule/legend";
import { z } from "zod";

const legendEntrySchema = z.object({
  label: z.string().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #ff8400"),
});

const patchSchema = z.object({
  type: z.enum(["sleep", "meal", "workout", "time_off"]),
  label: legendEntrySchema.shape.label,
  color: legendEntrySchema.shape.color,
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { calendarLegend: true },
  });

  return NextResponse.json(parseCalendarLegend(user?.calendarLegend));
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { calendarLegend: true },
    });

    const current = parseCalendarLegend(user?.calendarLegend);
    const next: CalendarLegendSettings = {
      ...current,
      [body.type as LegendEventType]: {
        label: body.label,
        color: body.color,
      },
    };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { calendarLegend: next },
    });

    return NextResponse.json(next);
  } catch (error) {
    console.error("Failed to save calendar legend:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save calendar legend";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
