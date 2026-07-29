"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CourseChat } from "@/components/chat/course-chat";
import { COURSE_COLORS, formatDate, formatDateTime } from "@/lib/utils";

type CourseResource = {
  id: string;
  title: string;
  sourceType: string;
  fileName: string | null;
  createdAt: string;
};

type Course = {
  id: string;
  name: string;
  term: string | null;
  color: string;
  currentScore: number | null;
  currentGrade: string | null;
  assignments: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    points: number | null;
  }>;
  exams: Array<{
    id: string;
    title: string;
    dateTime: string;
    location: string | null;
  }>;
  syllabus: { rawContent: string; sourceType: string } | null;
  resources: CourseResource[];
};

export default function CourseDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const [course, setCourse] = useState<Course | null>(null);
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [newAssignment, setNewAssignment] = useState({ title: "", dueDate: "" });
  const [newExam, setNewExam] = useState({ title: "", dateTime: "", location: "" });
  const [syllabusText, setSyllabusText] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceText, setResourceText] = useState("");
  const [resourceError, setResourceError] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState("");

  const loadCourse = useCallback(async (id: string) => {
    const res = await fetch(`/api/courses/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setCourse(data);
    setName(data.name);
    setTerm(data.term ?? "");
    setColor(data.color);
  }, []);

  useEffect(() => {
    if (courseId) loadCourse(courseId);
  }, [courseId, loadCourse]);

  async function saveCourse() {
    await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, term: term || null, color }),
    });
    loadCourse(courseId);
  }

  async function deleteCourse() {
    if (!confirm("Delete this course and all its data?")) return;
    await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/courses/${courseId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newAssignment.title,
        dueDate: newAssignment.dueDate || null,
      }),
    });
    setNewAssignment({ title: "", dueDate: "" });
    loadCourse(courseId);
  }

  async function addExam(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/courses/${courseId}/exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newExam),
    });
    setNewExam({ title: "", dateTime: "", location: "" });
    loadCourse(courseId);
  }

  async function reuploadSyllabus(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/courses/${courseId}/syllabus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: syllabusText, sourceType: "text" }),
    });
    setSyllabusText("");
    loadCourse(courseId);
  }

  async function uploadResourceFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResourceLoading(true);
    setResourceError("");

    try {
      const form = e.currentTarget;
      const fileInput = form.elements.namedItem("resource-file") as HTMLInputElement;
      const file = fileInput?.files?.[0];
      if (!file) throw new Error("Select a file");

      const formData = new FormData();
      formData.append("file", file);
      if (resourceTitle.trim()) {
        formData.append("title", resourceTitle.trim());
      }

      const res = await fetch(`/api/courses/${courseId}/resources`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResourceTitle("");
      form.reset();
      loadCourse(courseId);
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setResourceLoading(false);
    }
  }

  async function uploadResourceText(e: React.FormEvent) {
    e.preventDefault();
    setResourceLoading(true);
    setResourceError("");

    try {
      const res = await fetch(`/api/courses/${courseId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resourceTitle.trim() || "Additional notes",
          content: resourceText,
          sourceType: "text",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResourceTitle("");
      setResourceText("");
      loadCourse(courseId);
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setResourceLoading(false);
    }
  }

  async function deleteResource(resourceId: string) {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/courses/${courseId}/resources/${resourceId}`, {
      method: "DELETE",
    });
    if (expandedResourceId === resourceId) {
      setExpandedResourceId(null);
      setExpandedContent("");
    }
    loadCourse(courseId);
  }

  async function viewResource(resourceId: string) {
    if (expandedResourceId === resourceId) {
      setExpandedResourceId(null);
      setExpandedContent("");
      return;
    }

    const res = await fetch(`/api/courses/${courseId}/resources/${resourceId}`);
    if (!res.ok) return;
    const data = await res.json();
    setExpandedResourceId(resourceId);
    setExpandedContent(data.content);
  }

  if (!course) {
    return (
      <AppShell>
        <p className="text-zinc-500">Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
        ← Back to dashboard
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{course.name}</h1>
          {course.term && <p className="text-sm text-zinc-500">{course.term}</p>}
          {(course.currentGrade || course.currentScore != null) && (
            <p className="mt-1 text-sm text-zinc-600">
              Grade: {course.currentGrade ?? "—"}
              {course.currentScore != null && ` (${course.currentScore}%)`}
            </p>
          )}
        </div>
        <button
          onClick={deleteCourse}
          className="text-sm text-red-600 hover:underline"
        >
          Delete course
        </button>
      </div>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Course settings</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Term"
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-2 flex gap-2">
          {COURSE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-zinc-900" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          onClick={saveCourse}
          className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white"
        >
          Save
        </button>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">Assignments</h2>
          <ul className="mt-2 space-y-2">
            {course.assignments.map((a) => (
              <li key={a.id} className="flex justify-between text-sm">
                <span>{a.title}</span>
                <span className="text-zinc-500">
                  {a.dueDate ? formatDate(new Date(a.dueDate)) : "—"}
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={addAssignment} className="mt-3 flex gap-2">
            <input
              value={newAssignment.title}
              onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
              placeholder="Assignment title"
              className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
              required
            />
            <input
              type="datetime-local"
              value={newAssignment.dueDate}
              onChange={(e) => setNewAssignment({ ...newAssignment, dueDate: e.target.value })}
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded bg-zinc-800 px-2 py-1 text-sm text-white">
              Add
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">Exams</h2>
          <ul className="mt-2 space-y-2">
            {course.exams.map((exam) => (
              <li key={exam.id} className="flex justify-between text-sm">
                <span>{exam.title}</span>
                <span className="text-zinc-500">{formatDateTime(new Date(exam.dateTime))}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={addExam} className="mt-3 space-y-2">
            <input
              value={newExam.title}
              onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
              placeholder="Exam title"
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              required
            />
            <input
              type="datetime-local"
              value={newExam.dateTime}
              onChange={(e) => setNewExam({ ...newExam, dateTime: e.target.value })}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              required
            />
            <button type="submit" className="rounded bg-zinc-800 px-2 py-1 text-sm text-white">
              Add exam
            </button>
          </form>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Additional files</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Upload schedules, readings, or other course documents (PDF, DOCX, HTML, TXT).
        </p>

        {course.resources.length > 0 && (
          <ul className="mt-4 space-y-2">
            {course.resources.map((resource) => (
              <li
                key={resource.id}
                className="rounded border border-zinc-200 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{resource.title}</p>
                    <p className="text-xs text-zinc-500">
                      {resource.fileName ?? resource.sourceType.toUpperCase()} ·{" "}
                      {formatDate(new Date(resource.createdAt))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => viewResource(resource.id)}
                      className="text-indigo-600 hover:underline"
                    >
                      {expandedResourceId === resource.id ? "Hide" : "View"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteResource(resource.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {expandedResourceId === resource.id && (
                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs text-zinc-700">
                    {expandedContent}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-4">
          <input
            value={resourceTitle}
            onChange={(e) => setResourceTitle(e.target.value)}
            placeholder="Title (optional for file uploads)"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />

          <form onSubmit={uploadResourceFile} className="space-y-2">
            <input
              id="resource-file"
              name="resource-file"
              type="file"
              accept=".pdf,.docx,.html,.htm,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,text/plain"
              className="block w-full text-sm"
            />
            <button
              type="submit"
              disabled={resourceLoading}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {resourceLoading ? "Uploading..." : "Upload file"}
            </button>
          </form>

          <form onSubmit={uploadResourceText} className="space-y-2">
            <textarea
              value={resourceText}
              onChange={(e) => setResourceText(e.target.value)}
              rows={4}
              placeholder="Or paste text content..."
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={resourceLoading || !resourceText.trim()}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Save text resource
            </button>
          </form>
        </div>

        {resourceError && <p className="mt-2 text-sm text-red-600">{resourceError}</p>}
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Re-upload syllabus</h2>
        <form onSubmit={reuploadSyllabus} className="mt-2 space-y-2">
          <textarea
            value={syllabusText}
            onChange={(e) => setSyllabusText(e.target.value)}
            rows={4}
            placeholder="Paste updated syllabus text..."
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white">
            Replace syllabus
          </button>
        </form>
      </section>

      <div className="mt-6">
        <CourseChat courseId={course.id} courseName={course.name} />
      </div>
    </AppShell>
  );
}
