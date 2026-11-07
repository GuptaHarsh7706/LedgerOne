/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ops: {
          bg: '#0B0C15',
          dark: '#06070B',
          card: '#1F1F28',
          cardElevated: '#292A33',
          cardSubtle: '#1D1E27',
          border: 'rgba(255, 255, 255, 0.08)',
          borderStrong: 'rgba(255, 255, 255, 0.16)',
          blue: '#0C71FF',
          cyan: '#00FFCC',
          yellow: '#FFEF14',
          text: '#FFFFFF',
          textMuted: '#B5B9C3',
          textDim: 'rgba(255, 255, 255, 0.4)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.9' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        marquee: 'marquee 30s linear infinite',
        'marquee-fast': 'marquee 18s linear infinite',
        'pulse-slow': 'pulseSlow 4s ease-in-out infinite',
        float: 'float 5s ease-in-out infinite',
      },
      boxShadow: {
        'glow-cyan': '0 0 30px -5px rgba(0, 255, 204, 0.3)',
        'glow-blue': '0 0 40px -5px rgba(12, 113, 255, 0.35)',
        'glow-yellow': '0 0 30px -5px rgba(255, 239, 20, 0.3)',
        'card-elevated': '0 20px 40px -15px rgba(0, 0, 0, 0.7)',
      },
    },
  },
  plugins: [],
}
