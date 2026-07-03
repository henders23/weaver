/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6d5efc",
          dark: "#5a4ce0",
        },
      },
    },
  },
  plugins: [],
};
