import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F7F5",
        ink: "#1C2422",
        moss: {
          50: "#EDF5F0",
          100: "#D8EAE0",
          600: "#1E6B4F",
          700: "#175A42",
          800: "#124735",
        },
        amber: {
          50: "#FBF4E6",
          700: "#9A6710",
        },
        clay: {
          50: "#FAEEEC",
          700: "#A3402F",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,36,34,0.06), 0 4px 16px rgba(28,36,34,0.05)",
      },
    },
  },
  plugins: [],
};
export default config;
