import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { nextCourseColor } from "@/lib/utils";
import {
  ASSIGNMENT_BLOCK_MS,
  ensureDailyTemplates,
  findFirstAvailableSlot,
  getFixedBusyBlocksForUser,
  scheduleAllAssignments,
} from "@/lib/schedule/assignment-scheduling";
import { mergeBusyBlocks } from "@/lib/schedule/blocks";
import { z } from "zod";

const confirmSchema = z.object({
  courseName: z.string().min(1),
  term: z.string().optional().nullable(),
  color: z.string().optional(),
  sourceType: z.enum(["pdf", "docx", "html", "text"]),
  rawContent: z.string().min(1),
  fileName: z.string().optional().nullable(),
  assignments: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable().optional(),
      points: z.number().nullable().optional(),
      accepted: z.boolean(),
    }),
  ),
  exams: z.array(
    z.object({
      title: z.string(),
      dateTime: z.string(),
      location: z.string().nullable().optional(),
      accepted: z.boolean(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = confirmSchema.parse(await req.json());
    const userId = session.user.id;

    const courseCount = await prisma.course.count({ where: { userId } });

    const course = await prisma.course.create({
      data: {
        userId,
        name: body.courseName,
        term: body.term ?? null,
        color: body.color ?? nextCourseColor(courseCount),
      },
    });

    await prisma.syllabus.create({
      data: {
        courseId: course.id,
        sourceType: body.sourceType,
        rawContent: body.rawContent,
        fileName: body.fileName ?? null,
        parsedAt: new Date(),
      },
    });

    const acceptedAssignments = body.assignments.filter((a) => a.accepted);
    const now = new Date();
    await ensureDailyTemplates(userId);

    const latestDue = acceptedAssignments.reduce((latest, assignment) => {
      if (!assignment.dueDate) return latest;
      const due = new Date(assignment.dueDate);
      return due > latest ? due : latest;
    }, now);

    let busyBlocks =
      latestDue > now
        ? await getFixedBusyBlocksForUser(userId, now, latestDue)
        : [];

    for (const assignment of acceptedAssignments) {
      const created = await prisma.assignment.create({
        data: {
          courseId: course.id,
          title: assignment.title,
          dueDate: assignment.dueDate ? new Date(assignment.dueDate) : null,
          points: assignment.points ?? null,
          source: "parsed",
        },
      });

      if (assignment.dueDate) {
        const due = new Date(assignment.dueDate);
        if (due > now) {
          const slot = findFirstAvailableSlot(
            busyBlocks,
            now,
            due,
            ASSIGNMENT_BLOCK_MS,
          );
          if (slot) {
            await prisma.scheduleEvent.create({
              data: {
                userId,
                courseId: course.id,
                assignmentId: created.id,
                title: assignment.title,
                type: "coursework",
                startTime: slot.start,
                endTime: slot.end,
              },
            });
            busyBlocks = mergeBusyBlocks([...busyBlocks, slot]);
          }
        }
      }
    }

    const acceptedExams = body.exams.filter((e) => e.accepted);
    for (const exam of acceptedExams) {
      await prisma.exam.create({
        data: {
          courseId: course.id,
          title: exam.title,
          dateTime: new Date(exam.dateTime),
          location: exam.location ?? null,
          source: "parsed",
        },
      });
    }

    return NextResponse.json({ courseId: course.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
