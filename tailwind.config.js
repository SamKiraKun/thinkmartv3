module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        thinkmart: {
          deep: "#2b2f7a",
          light: "#5b4bff",
          bg: "#0f172a", // Dark background fallback
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['General Sans', 'Inter', 'sans-serif'], // Fallback sequence
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(to bottom, #5b4bff, #2b2f7a)',
      }
    },
  },
  plugins: [],
};
