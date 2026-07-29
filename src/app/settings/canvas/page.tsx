"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

export default function CanvasSettingsPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/canvas/connect")
      .then((r) => r.json())
      .then((data) => {
        setConnected(data.connected);
        if (data.connection?.baseUrl) setBaseUrl(data.connection.baseUrl);
      });
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/canvas/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, token }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Connection failed");
      return;
    }
    setConnected(true);
    setToken("");
    setMessage("Canvas connected successfully.");
  }

  async function disconnect() {
    await fetch("/api/canvas/connect", { method: "DELETE" });
    setConnected(false);
    setMessage("Disconnected.");
  }

  async function sync(includeGrades = false) {
    setSyncing(true);
    setMessage("");
    const res = await fetch(
      `/api/canvas/sync${includeGrades ? "?grades=true" : ""}`,
      { method: "POST" },
    );
    const data = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setMessage(data.error ?? "Sync failed");
    } else {
      setMessage(`Synced ${data.courseCount ?? 0} courses.`);
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Canvas integration</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Connect Canvas to sync courses, assignments, exams, and grades.
      </p>

      <div className="mt-6 max-w-lg rounded-lg border border-zinc-200 bg-white p-6">
        {connected ? (
          <div className="space-y-4">
            <p className="text-sm text-green-700">Connected to {baseUrl}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => sync(false)}
                disabled={syncing}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Sync now"}
              </button>
              <button
                onClick={() => sync(true)}
                disabled={syncing}
                className="rounded-md border border-indigo-600 px-4 py-2 text-sm text-indigo-600 disabled:opacity-50"
              >
                Sync + grades
              </button>
              <button
                onClick={disconnect}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={connect} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Canvas URL</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://yourschool.instructure.com"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Personal Access Token</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
            >
              Connect Canvas
            </button>
          </form>
        )}

        {message && <p className="mt-4 text-sm text-zinc-600">{message}</p>}
      </div>

      <div className="mt-6 max-w-lg text-sm text-zinc-500">
        <p className="font-medium text-zinc-700">How to get a token</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open Canvas → Account → Settings</li>
          <li>Scroll to Approved Integrations → New Access Token</li>
          <li>Copy the token and paste it here</li>
        </ol>
      </div>
    </AppShell>
  );
}
