import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "#07080a",
        surface: {
          subtle: "#0d0e12",
          card: "#12141a",
          elevated: "#181a22",
          hover: "#1e212b",
        },
        hairline: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          strong: "rgba(255, 255, 255, 0.12)",
        },
        ink: {
          primary: "#f8fafc",
          secondary: "#cbd5e1",
          muted: "#64748b",
          disabled: "#334155",
        },
        brand: {
          DEFAULT: "#4f46e5",
          light: "#6366f1",
          glow: "rgba(99, 102, 241, 0.15)",
        },
        accent: {
          success: "#10b981",
          warning: "#f59e0b",
          danger: "#ef4444",
          info: "#0ea5e9",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Inter",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          '"Fira Code"',
          "monospace",
        ],
      },
      boxShadow: {
        "hairline-glow": "0 0 0 1px rgba(99, 102, 241, 0.25), 0 4px 20px -2px rgba(99, 102, 241, 0.10)",
        "subtle-card": "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)",
        "floating-panel": "0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
