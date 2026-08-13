"use client";

import { THEME_OPTIONS, type Theme } from "@/lib/theme";
import { useTheme } from "@/components/theme-provider";

type ThemeToggleProps = {
  variant?: "inline" | "menu";
};

export function ThemeToggle({ variant = "inline" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (variant === "menu") {
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-200">
        <span>Theme</span>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as Theme)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
          aria-label="Theme"
        >
          {THEME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="sr-only">Theme</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
        aria-label="Theme"
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
