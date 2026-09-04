/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sinhala: ['"Noto Sans Sinhala"', "sans-serif"],
        tamil: ['"Noto Sans Tamil"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
