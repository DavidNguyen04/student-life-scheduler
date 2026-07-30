import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { nextCourseColor } from "@/lib/utils";
import { replaceLectureEvents } from "@/lib/schedule/lectures";
import { scheduleUserCalendar } from "@/lib/schedule/pipeline";
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
  lectures: z
    .array(
      z.object({
        title: z.string(),
        days: z.array(z.string()),
        startTime: z.string(),
        endTime: z.string(),
        location: z.string().nullable().optional(),
        accepted: z.boolean(),
      }),
    )
    .default([]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = confirmSchema.parse(await req.json());
    const userId = session.user.id;

    const courseId = await prisma.$transaction(async (tx) => {
      const courseCount = await tx.course.count({ where: { userId } });

      const course = await tx.course.create({
        data: {
          userId,
          name: body.courseName,
          term: body.term ?? null,
          color: body.color ?? nextCourseColor(courseCount),
        },
      });

      await tx.syllabus.create({
        data: {
          courseId: course.id,
          sourceType: body.sourceType,
          rawContent: body.rawContent,
          fileName: body.fileName ?? null,
          parsedAt: new Date(),
        },
      });

      const acceptedAssignments = body.assignments.filter((assignment) => assignment.accepted);
      for (const assignment of acceptedAssignments) {
        await tx.assignment.create({
          data: {
            courseId: course.id,
            title: assignment.title,
            dueDate: assignment.dueDate ? new Date(assignment.dueDate) : null,
            points: assignment.points ?? null,
            source: "parsed",
          },
        });
      }

      const acceptedExams = body.exams.filter((exam) => exam.accepted);
      for (const exam of acceptedExams) {
        await tx.exam.create({
          data: {
            courseId: course.id,
            title: exam.title,
            dateTime: new Date(exam.dateTime),
            location: exam.location ?? null,
            source: "parsed",
          },
        });
      }

      const acceptedLectures = body.lectures.filter(
        (lecture) => lecture.accepted && lecture.days.length > 0,
      );
      if (acceptedLectures.length > 0) {
        await replaceLectureEvents(userId, course.id, course.name, acceptedLectures, tx);
      }

      return course.id;
    });

    try {
      await scheduleUserCalendar(userId);
    } catch (scheduleError) {
      console.error("Calendar scheduling failed after course creation:", scheduleError);
    }

    return NextResponse.json({ courseId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
