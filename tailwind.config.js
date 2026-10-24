/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          500: '#3b6ef5',
          600: '#2955e0',
          700: '#2143b5',
        },
        sidebar: {
          DEFAULT: '#111827',
          hover: '#1f2937',
          active: '#2955e0',
          muted: '#9ca3af',
          heading: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
