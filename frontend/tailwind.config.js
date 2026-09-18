/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: {
          DEFAULT: "var(--surface)",
          elevated: "var(--surface-elevated)",
          muted: "var(--surface-muted)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
        },
        section: {
          soft: "var(--section-soft)",
        },
        card: {
          DEFAULT: "var(--surface)",
          foreground: "var(--text-primary)",
        },
        foreground: "var(--text-primary)",
        navy: {
          950: "#070a13",
          900: "#0b1220",
          850: "#0e172a",
          800: "#131f38",
          750: "#182644",
          700: "#1e293b",
        },
        primary: {
          DEFAULT: "#6366f1",
          foreground: "#ffffff",
          hover: "#4f46e5",
          light: "#818cf8",
        },
        secondary: {
          DEFAULT: "#0ea5e9",
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "#ffffff",
        },
        danger: {
          DEFAULT: "var(--error)",
          foreground: "#ffffff",
        },
        info: {
          DEFAULT: "var(--info)",
          foreground: "#ffffff",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
