/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        ink: {
          950: "#06090b",
          900: "#0a0e11",
          850: "#0e1418",
          800: "#11161a",
          750: "#151b21",
          700: "#1a222a",
          650: "#222c36",
          600: "#2a333d",
          500: "#3a4550",
        },
        signal: {
          DEFAULT: "#00ff9c",
          dim: "#00b377",
          glow: "rgba(0,255,156,0.35)",
        },
        amber: "#ffb020",
        magenta: "#ff3366",
        fg: {
          DEFAULT: "#e8eef0",
          soft: "#a7b3bc",
          muted: "#6b7884",
          faint: "#44505a",
        },
      },
      fontFamily: {
        display: ['"Major Mono Display"', "monospace"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        signal: "0 0 0 1px rgba(0,255,156,0.4), 0 0 18px rgba(0,255,156,0.25)",
        inset: "inset 0 0 60px rgba(0,0,0,0.6)",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        sweep: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "41%": { opacity: "1" },
          "42%": { opacity: "0.6" },
          "43%": { opacity: "1" },
          "88%": { opacity: "1" },
          "89%": { opacity: "0.4" },
          "90%": { opacity: "1" },
        },
      },
      animation: {
        blink: "blink 1.4s ease-in-out infinite",
        sweep: "sweep 6s linear infinite",
        rise: "rise 0.5s ease-out both",
        flicker: "flicker 4s linear infinite",
      },
    },
  },
  plugins: [],
};
