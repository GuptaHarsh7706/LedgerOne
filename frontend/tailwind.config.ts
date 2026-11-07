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
        "hairline-glow": "0 0 0 1px rgba(99, 102, 241, 0.25), 0 4px 20px -2px rgba(99, 102, 241, 0.15)",
        "subtle-card": "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)",
        "floating-panel": "0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        "spotlight": "0 0 50px -10px rgba(99, 102, 241, 0.2)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.04)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        glowMesh: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 2.5s infinite",
        pulseSlow: "pulseSlow 4s ease-in-out infinite",
        floatSlow: "floatSlow 6s ease-in-out infinite",
        glowMesh: "glowMesh 15s ease infinite",
      },
    },
  },
  plugins: [],
};

export default config;
