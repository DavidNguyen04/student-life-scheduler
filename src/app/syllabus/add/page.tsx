"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SyllabusReviewForm } from "@/components/syllabus/review-form";
import type { SyllabusParseResult } from "@/lib/syllabus/parser";

type ParsedPayload = SyllabusParseResult & {
  sourceType: string;
  fileName?: string;
};

export default function AddSyllabusPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"pdf" | "html" | "text">("text");
  const [content, setContent] = useState("");
  const [parsed, setParsed] = useState<ParsedPayload | null>(null);
  const [rawContent, setRawContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "pdf") {
        const input = document.getElementById("pdf-file") as HTMLInputElement;
        const file = input?.files?.[0];
        if (!file) throw new Error("Select a PDF file");

        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/syllabus/parse", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setParsed(data);
        setRawContent(data.rawText);
      } else {
        if (!content.trim()) throw new Error("Paste syllabus content");
        const res = await fetch("/api/syllabus/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, sourceType: mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setParsed(data);
        setRawContent(content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(data: Parameters<
    React.ComponentProps<typeof SyllabusReviewForm>["onConfirm"]
  >[0]) {
    const res = await fetch("/api/syllabus/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    router.push(`/courses/${result.courseId}`);
  }

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold">Add syllabus</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload or paste a syllabus to create a course automatically.
        </p>

        {!parsed ? (
          <form onSubmit={handleParse} className="mt-6 space-y-4">
            <div className="flex gap-2">
              {(["text", "html", "pdf"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    mode === m
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            {mode === "pdf" ? (
              <input id="pdf-file" type="file" accept=".pdf" className="block w-full text-sm" />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                placeholder={
                  mode === "html"
                    ? "Paste HTML from Canvas syllabus page..."
                    : "Paste plain text syllabus..."
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              />
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Parsing..." : "Parse syllabus"}
            </button>
          </form>
        ) : (
          <div className="mt-6">
            <SyllabusReviewForm
              initial={parsed}
              rawContent={rawContent}
              onConfirm={handleConfirm}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
