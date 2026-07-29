"use client";

import { useState } from "react";
import type { SyllabusParseResult, ParsedAssignment, ParsedExam } from "@/lib/syllabus/parser";
import { COURSE_COLORS } from "@/lib/utils";

type Props = {
  initial: SyllabusParseResult & { sourceType: string; fileName?: string };
  rawContent: string;
  onConfirm: (data: {
    courseName: string;
    term: string | null;
    color: string;
    sourceType: "pdf" | "html" | "text";
    rawContent: string;
    fileName?: string;
    assignments: ParsedAssignment[];
    exams: ParsedExam[];
  }) => Promise<void>;
};

export function SyllabusReviewForm({ initial, rawContent, onConfirm }: Props) {
  const [courseName, setCourseName] = useState(
    initial.courseName ?? initial.courseCode ?? "",
  );
  const [term, setTerm] = useState(initial.term ?? "");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [assignments, setAssignments] = useState(initial.assignments);
  const [exams, setExams] = useState(initial.exams);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseName.trim()) {
      setError("Course name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm({
        courseName: courseName.trim(),
        term: term.trim() || null,
        color,
        sourceType: initial.sourceType as "pdf" | "html" | "text",
        rawContent,
        fileName: initial.fileName,
        assignments,
        exams,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Course name *</span>
          <input
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Term</span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
            placeholder="Fall 2026"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-zinc-700">Color</span>
        <div className="mt-2 flex gap-2">
          {COURSE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-zinc-900" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </label>

      <section>
        <h3 className="mb-2 font-medium">Assignments ({assignments.length})</h3>
        <div className="space-y-2">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded border border-zinc-200 p-3">
              <input
                type="checkbox"
                checked={a.accepted}
                onChange={(e) =>
                  setAssignments((prev) =>
                    prev.map((x) =>
                      x.id === a.id ? { ...x, accepted: e.target.checked } : x,
                    ),
                  )
                }
              />
              <input
                value={a.title}
                onChange={(e) =>
                  setAssignments((prev) =>
                    prev.map((x) =>
                      x.id === a.id ? { ...x, title: e.target.value } : x,
                    ),
                  )
                }
                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm"
              />
              <input
                type="datetime-local"
                value={a.dueDate ? a.dueDate.slice(0, 16) : ""}
                onChange={(e) =>
                  setAssignments((prev) =>
                    prev.map((x) =>
                      x.id === a.id
                        ? {
                            ...x,
                            dueDate: e.target.value
                              ? new Date(e.target.value).toISOString()
                              : null,
                          }
                        : x,
                    ),
                  )
                }
                className="rounded border border-zinc-200 px-2 py-1 text-sm"
              />
            </div>
          ))}
          {assignments.length === 0 && (
            <p className="text-sm text-zinc-500">No assignments detected. Add them on the course page later.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Exams ({exams.length})</h3>
        <div className="space-y-2">
          {exams.map((exam) => (
            <div key={exam.id} className="flex items-center gap-3 rounded border border-zinc-200 p-3">
              <input
                type="checkbox"
                checked={exam.accepted}
                onChange={(e) =>
                  setExams((prev) =>
                    prev.map((x) =>
                      x.id === exam.id ? { ...x, accepted: e.target.checked } : x,
                    ),
                  )
                }
              />
              <input
                value={exam.title}
                onChange={(e) =>
                  setExams((prev) =>
                    prev.map((x) =>
                      x.id === exam.id ? { ...x, title: e.target.value } : x,
                    ),
                  )
                }
                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-sm"
              />
              <input
                type="datetime-local"
                value={exam.dateTime.slice(0, 16)}
                onChange={(e) =>
                  setExams((prev) =>
                    prev.map((x) =>
                      x.id === exam.id
                        ? { ...x, dateTime: new Date(e.target.value).toISOString() }
                        : x,
                    ),
                  )
                }
                className="rounded border border-zinc-200 px-2 py-1 text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Creating course..." : "Create course"}
      </button>
    </form>
  );
}
