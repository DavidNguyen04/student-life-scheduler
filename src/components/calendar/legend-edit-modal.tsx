"use client";

import { useEffect, useState } from "react";
import { COURSE_COLORS } from "@/lib/utils";

type LegendEditModalProps = {
  open: boolean;
  title: string;
  name: string;
  color: string;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
};

export function LegendEditModal({
  open,
  title,
  name,
  color,
  saving = false,
  error = "",
  onClose,
  onSave,
}: LegendEditModalProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftColor, setDraftColor] = useState(color);

  useEffect(() => {
    if (!open) return;
    setDraftName(name);
    setDraftColor(color);
  }, [open, name, color]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <h2 className="font-medium">{title}</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-zinc-600">Name</span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600">Color</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={draftColor}
                onChange={(e) => setDraftColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-zinc-300"
              />
              <input
                value={draftColor}
                onChange={(e) => setDraftColor(e.target.value)}
                pattern="^#[0-9a-fA-F]{6}$"
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono"
                required
              />
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            {COURSE_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Use color ${swatch}`}
                onClick={() => setDraftColor(swatch)}
                className={`h-6 w-6 rounded-full border ${
                  draftColor.toLowerCase() === swatch.toLowerCase()
                    ? "border-zinc-900 ring-2 ring-zinc-300"
                    : "border-zinc-200"
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded px-3 py-2 text-sm text-zinc-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !draftName.trim() || !/^#[0-9a-fA-F]{6}$/.test(draftColor)}
            onClick={() => onSave(draftName.trim(), draftColor)}
            className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
