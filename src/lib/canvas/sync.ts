import { prisma } from "@/lib/db";
import { CanvasClient } from "@/lib/canvas/client";
import { decryptToken } from "@/lib/canvas/crypto";
import { parseSyllabusText } from "@/lib/syllabus/parser";
import { nextCourseColor } from "@/lib/utils";

export async function getCanvasClient(userId: string): Promise<CanvasClient | null> {
  const connection = await prisma.canvasConnection.findUnique({
    where: { userId },
  });
  if (!connection) return null;
  const token = decryptToken(connection.encryptedToken);
  return new CanvasClient(connection.baseUrl, token);
}

export async function syncCanvasForUser(userId: string) {
  const client = await getCanvasClient(userId);
  if (!client) {
    throw new Error("Canvas not connected");
  }

  const existingCourses = await prisma.course.count({ where: { userId } });
  let colorIndex = existingCourses;

  const canvasCourses = await client.listCourses();
  const activeCourses = canvasCourses.filter(
    (c) => c.name && !c.name.toLowerCase().includes("sandbox"),
  );

  const syncedCourseIds: string[] = [];

  for (const canvasCourse of activeCourses) {
    const canvasId = String(canvasCourse.id);
    let course = await prisma.course.findFirst({
      where: { userId, canvasCourseId: canvasId },
    });

    if (!course) {
      course = await prisma.course.findFirst({
        where: {
          userId,
          name: canvasCourse.name,
          canvasCourseId: null,
        },
      });
    }

    if (course) {
      course = await prisma.course.update({
        where: { id: course.id },
        data: {
          name: canvasCourse.name,
          canvasCourseId: canvasId,
        },
      });
    } else {
      course = await prisma.course.create({
        data: {
          userId,
          name: canvasCourse.name,
          term: canvasCourse.course_code ?? null,
          color: nextCourseColor(colorIndex++),
          canvasCourseId: canvasId,
        },
      });
    }

    syncedCourseIds.push(course.id);

    if (canvasCourse.syllabus_body) {
      await prisma.syllabus.upsert({
        where: { courseId: course.id },
        create: {
          courseId: course.id,
          sourceType: "html",
          rawContent: canvasCourse.syllabus_body,
          parsedAt: new Date(),
        },
        update: {
          sourceType: "html",
          rawContent: canvasCourse.syllabus_body,
          parsedAt: new Date(),
        },
      });
    }

    const assignments = await client.listAssignments(canvasCourse.id);
    for (const assignment of assignments) {
      const canvasAssignmentId = String(assignment.id);
      const existing = await prisma.assignment.findFirst({
        where: { courseId: course.id, canvasAssignmentId },
      });

      const data = {
        title: assignment.name,
        dueDate: assignment.due_at ? new Date(assignment.due_at) : null,
        points: assignment.points_possible,
        source: "canvas" as const,
      };

      if (existing) {
        await prisma.assignment.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.assignment.create({
          data: {
            courseId: course.id,
            canvasAssignmentId,
            ...data,
          },
        });
      }
    }
  }

  const events = await client.listCalendarEvents();
  for (const event of events) {
    const contextMatch = event.context_code?.match(/course_(\d+)/);
    if (!contextMatch) continue;

    const course = await prisma.course.findFirst({
      where: { userId, canvasCourseId: contextMatch[1] },
    });
    if (!course) continue;

    const canvasEventId = String(event.id);
    const existing = await prisma.exam.findFirst({
      where: { courseId: course.id, canvasEventId },
    });

    const data = {
      title: event.title,
      dateTime: new Date(event.start_at),
      location: event.location_name ?? null,
      source: "canvas" as const,
    };

    if (existing) {
      await prisma.exam.update({ where: { id: existing.id }, data });
    } else {
      await prisma.exam.create({
        data: { courseId: course.id, canvasEventId, ...data },
      });
    }
  }

  await prisma.syncLog.create({
    data: {
      userId,
      status: "success",
      message: `Synced ${syncedCourseIds.length} courses`,
      details: { courseIds: syncedCourseIds },
    },
  });

  return { courseCount: syncedCourseIds.length };
}

export async function syncGradesForUser(userId: string) {
  const client = await getCanvasClient(userId);
  if (!client) throw new Error("Canvas not connected");

  const coursesWithScores = await client.listCoursesWithScores();

  for (const canvasCourse of coursesWithScores) {
    const course = await prisma.course.findFirst({
      where: { userId, canvasCourseId: String(canvasCourse.id) },
    });
    if (!course) continue;

    const enrollment = canvasCourse.enrollments?.[0];
    const currentScore = enrollment?.computed_current_score ?? null;
    const currentGrade = enrollment?.computed_current_grade ?? null;
    const finalScore = enrollment?.computed_final_score ?? null;
    const finalGrade = enrollment?.computed_final_grade ?? null;

    await prisma.course.update({
      where: { id: course.id },
      data: { currentScore, currentGrade, finalScore, finalGrade },
    });

    await prisma.gradeSnapshot.create({
      data: {
        courseId: course.id,
        currentScore,
        currentGrade,
        finalScore,
        finalGrade,
      },
    });
  }
}

export function mergeSyllabusFromCanvas(html: string) {
  return parseSyllabusText(html, "html");
}
