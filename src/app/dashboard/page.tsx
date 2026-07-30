import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { prioritizeAssignments } from "@/lib/priority/engine";
import { addDays, startOfDay, endOfDay } from "date-fns";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [courses, assignments, exams, todayEvents, priorityItems] = await Promise.all([
    prisma.course.findMany({
      where: { userId: user.id },
      include: { _count: { select: { assignments: true, exams: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.assignment.findMany({
      where: {
        course: { userId: user.id },
        dueDate: { gte: now },
      },
      include: { course: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.exam.findMany({
      where: {
        course: { userId: user.id },
        dateTime: { gte: now },
      },
      include: { course: true },
      orderBy: { dateTime: "asc" },
      take: 5,
    }),
    prisma.scheduleEvent.findMany({
      where: {
        userId: user.id,
        type: { not: "sleep" },
        startTime: { lte: todayEnd },
        endTime: { gte: todayStart },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.assignment.findMany({
      where: {
        course: { userId: user.id },
        dueDate: { gte: now, lte: addDays(now, 14) },
      },
      include: {
        course: {
          select: { id: true, name: true, color: true, currentScore: true, currentGrade: true },
        },
      },
    }),
  ]);

  const prioritized = prioritizeAssignments(priorityItems).slice(0, 5);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-zinc-500">Welcome back, {user.name ?? user.email}</p>
        </div>
        <Link
          href="/syllabus/add"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
        >
          Add syllabus
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">Today&apos;s agenda</h2>
          {todayEvents.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Nothing scheduled today.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {todayEvents.map((event) => (
                <li key={event.id} className="flex justify-between text-sm">
                  <span>{event.title}</span>
                  <span className="text-zinc-500">
                    {formatDateTime(event.startTime)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">Focus this week</h2>
          {prioritized.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No upcoming assignments.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {prioritized.map((item) => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: item.course.color }}
                    />
                    <span>{item.title}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        item.priorityLabel === "high"
                          ? "bg-red-100 text-red-700"
                          : item.priorityLabel === "medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {item.priorityLabel}
                    </span>
                  </div>
                  <span className="text-zinc-500">
                    {item.dueDate ? formatDateTime(item.dueDate) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">Upcoming assignments</h2>
          <ul className="mt-3 space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex justify-between text-sm">
                <span>
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: a.course.color }}
                  />
                  {a.title}
                </span>
                <span className="text-zinc-500">
                  {a.dueDate ? formatDateTime(a.dueDate) : "—"}
                </span>
              </li>
            ))}
            {assignments.length === 0 && (
              <p className="text-sm text-zinc-500">Add a syllabus to get started.</p>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">Upcoming exams</h2>
          <ul className="mt-3 space-y-2">
            {exams.map((exam) => (
              <li key={exam.id} className="flex justify-between text-sm">
                <span>
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: exam.course.color }}
                  />
                  {exam.title}
                </span>
                <span className="text-zinc-500">{formatDateTime(exam.dateTime)}</span>
              </li>
            ))}
            {exams.length === 0 && (
              <p className="text-sm text-zinc-500">No exams scheduled.</p>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Course board</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="rounded-lg border border-zinc-100 p-4 hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: course.color }}
                />
                <span className="font-medium">{course.name}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {course._count.assignments} assignments · {course._count.exams} exams
              </p>
            </Link>
          ))}
          {courses.length === 0 && (
            <p className="text-sm text-zinc-500">
              No courses yet.{" "}
              <Link href="/syllabus/add" className="text-indigo-600 hover:underline">
                Add your first syllabus
              </Link>
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
