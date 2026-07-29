import { Assignment, Course } from "@/generated/prisma/client";

export type PrioritizedAssignment = Assignment & {
  course: Pick<Course, "id" | "name" | "color" | "currentScore" | "currentGrade">;
  priority: number;
  priorityLabel: "high" | "medium" | "low";
};

const WEIGHTS = {
  urgency: 0.4,
  gradeRisk: 0.35,
  points: 0.15,
  submission: 0.1,
};

function urgencyScore(dueDate: Date | null, now = new Date()): number {
  if (!dueDate) return 0.2;
  const ms = dueDate.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 0) return 1;
  if (days <= 1) return 0.95;
  if (days <= 3) return 0.8;
  if (days <= 7) return 0.6;
  if (days <= 14) return 0.4;
  return 0.2;
}

function gradeRiskScore(currentScore: number | null | undefined): number {
  if (currentScore == null) return 0.5;
  if (currentScore < 60) return 1;
  if (currentScore < 70) return 0.85;
  if (currentScore < 80) return 0.6;
  if (currentScore < 90) return 0.35;
  return 0.15;
}

function pointsScore(points: number | null | undefined): number {
  if (!points) return 0.3;
  return Math.min(points / 100, 1);
}

export function computePriority(
  assignment: Assignment,
  course: Pick<Course, "currentScore" | "currentGrade">,
  now = new Date(),
): number {
  const urgency = urgencyScore(assignment.dueDate, now);
  const gradeRisk = gradeRiskScore(course.currentScore);
  const points = pointsScore(assignment.points);
  const submission = assignment.submitted ? 0 : 1;

  return (
    WEIGHTS.urgency * urgency +
    WEIGHTS.gradeRisk * gradeRisk +
    WEIGHTS.points * points +
    WEIGHTS.submission * submission
  );
}

export function prioritizeAssignments(
  items: Array<Assignment & { course: Pick<Course, "id" | "name" | "color" | "currentScore" | "currentGrade"> }>,
): PrioritizedAssignment[] {
  return items
    .map((item) => {
      const priority = computePriority(item, item.course);
      const priorityLabel: PrioritizedAssignment["priorityLabel"] =
        priority >= 0.7 ? "high" : priority >= 0.45 ? "medium" : "low";
      return { ...item, priority, priorityLabel };
    })
    .sort((a, b) => b.priority - a.priority);
}
