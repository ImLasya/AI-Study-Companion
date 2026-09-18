import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = "" }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center h-8 w-16 rounded-full p-1 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 select-none border cursor-pointer ${
        isDark
          ? "bg-surface-elevated border-border text-text-primary focus-visible:ring-offset-background"
          : "bg-surface-muted border-border text-text-primary focus-visible:ring-offset-background"
      } ${className}`}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Sliding indicator pill */}
      <span
        aria-hidden="true"
        className={`absolute top-1 left-1 w-6 h-6 rounded-full transition-transform duration-200 ease-in-out pointer-events-none shadow-sm ${
          isDark
            ? "translate-x-8 bg-accent text-white"
            : "translate-x-0 bg-white border border-slate-200 text-amber-500 shadow-slate-200"
        }`}
      />

      {/* Sun icon */}
      <span
        className={`w-6 h-6 flex items-center justify-center transition-colors duration-200 z-10 ${
          !isDark ? "text-amber-500 font-semibold" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
      </span>

      {/* Moon icon */}
      <span
        className={`w-6 h-6 flex items-center justify-center transition-colors duration-200 z-10 ml-auto ${
          isDark ? "text-white font-semibold" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
      </span>
    </button>
  );
};
