import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#07080A",
        sidebar: "#0D0E12",
        surface: {
          subtle: "#0F1117",
          primary: "#12141A",
          elevated: "#181A22",
          secondary: "#1E212B",
          hover: "#242834",
        },
        ink: {
          primary: "#F4F5F7",
          secondary: "#A1A6B3",
          muted: "#707787",
        },
        brand: {
          DEFAULT: "#6366F1",
          light: "#818CF8",
          dark: "#4F46E5",
        },
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#EF4444",
          info: "#38BDF8",
        },
        hairline: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          strong: "rgba(255, 255, 255, 0.12)",
          glow: "rgba(99, 102, 241, 0.25)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Geist",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "monospace",
        ],
      },
      boxShadow: {
        "hairline-subtle": "0 0 0 1px rgba(255, 255, 255, 0.06)",
        "hairline-strong": "0 0 0 1px rgba(255, 255, 255, 0.12)",
        "subtle-card": "0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)",
        "floating-panel": "0 12px 36px -4px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        "spotlight": "0 0 50px -10px rgba(99, 102, 241, 0.25)",
      },
      animation: {
        "pulse-slow": "pulseSlow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "shimmer": "shimmer 2.5s infinite linear",
        "glow-mesh": "glowMesh 10s ease infinite alternate",
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        glowMesh: {
          "0%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(20px, -20px) scale(1.05)" },
          "100%": { transform: "translate(-20px, 20px) scale(0.95)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
