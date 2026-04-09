import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",        // ← これが超重要！
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
