"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_DAILY_TEMPLATE_SETTINGS,
  TEMPLATE_TITLES,
  type DailyTemplateSettings,
  type TemplateKey,
} from "@/lib/schedule/templates";

const TEMPLATE_GROUPS: Array<{
  heading: string;
  keys: TemplateKey[];
}> = [
  { heading: "Sleep", keys: ["sleep"] },
  { heading: "Meals", keys: ["breakfast", "lunch", "dinner"] },
];

type DailyTemplatesModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export function DailyTemplatesModal({
  open,
  onClose,
  onSaved,
}: DailyTemplatesModalProps) {
  const [templates, setTemplates] = useState<DailyTemplateSettings>(
    DEFAULT_DAILY_TEMPLATE_SETTINGS,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);
    setError("");

    void fetch("/api/schedule/templates", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load daily templates");
        }
        const data = (await res.json()) as { templates: DailyTemplateSettings };
        setTemplates(data.templates);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load daily templates",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [open]);

  function updateTemplate(key: TemplateKey, patch: Partial<DailyTemplateSettings[TemplateKey]>) {
    setTemplates((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/schedule/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(templates),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save daily templates");
      setSaving(false);
      return;
    }

    setSaving(false);
    await onSaved();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={handleSave}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
      >
        <h2 className="font-medium">Edit daily templates</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Set your usual sleep and meal times. Toggle time blocking to show or hide each block on
          the calendar.
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="mt-6 text-sm text-zinc-500">Loading templates...</p>
        ) : (
          <div className="mt-6 space-y-6">
            {TEMPLATE_GROUPS.map((group) => (
              <section key={group.heading}>
                <h3 className="text-sm font-medium text-zinc-700">{group.heading}</h3>
                <div className="mt-3 space-y-4">
                  {group.keys.map((key) => (
                    <div
                      key={key}
                      className="rounded-lg border border-zinc-200 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{TEMPLATE_TITLES[key]}</span>
                        <label className="flex items-center gap-2 text-sm text-zinc-600">
                          <input
                            type="checkbox"
                            checked={templates[key].blockTime}
                            onChange={(e) =>
                              updateTemplate(key, { blockTime: e.target.checked })
                            }
                          />
                          Block time
                        </label>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="time"
                          value={templates[key].start}
                          onChange={(e) => updateTemplate(key, { start: e.target.value })}
                          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                          required
                        />
                        <span className="text-zinc-400">to</span>
                        <input
                          type="time"
                          value={templates[key].end}
                          onChange={(e) => updateTemplate(key, { end: e.target.value })}
                          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                          required
                        />
                      </div>
                      {key === "sleep" && (
                        <p className="mt-2 text-xs text-zinc-500">
                          End time can be the next morning (e.g. 23:00 to 07:00).
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-2 text-sm text-zinc-600"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={loading || saving}
            className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save templates"}
          </button>
        </div>
      </form>
    </div>
  );
}
