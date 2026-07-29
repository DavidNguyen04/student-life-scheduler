"use client";

import { useState } from "react";

export function CourseChat({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, message: userMsg }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? data.error ?? "No response" },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Failed to get a response." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function indexSyllabus() {
    await fetch("/api/chat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h3 className="font-medium">Course assistant — {courseName}</h3>
        <button
          onClick={indexSyllabus}
          className="text-xs text-indigo-600 hover:underline"
        >
          Index syllabus
        </button>
      </div>
      <div className="max-h-64 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Ask about due dates, exams, or study planning. I won&apos;t answer graded work directly.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "ml-8 bg-indigo-50" : "mr-8 bg-zinc-100"
            }`}
          >
            {m.content}
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} className="flex gap-2 border-t border-zinc-100 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
