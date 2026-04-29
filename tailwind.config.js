/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{html,ts,tsx,js}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf3f3',
          100: '#fbe2e1',
          200: '#f6c1bf',
          500: '#e2453f',
          600: '#d72f2a',
          700: '#b3231f',
          800: '#8e1c19',
          900: '#6b1512',
        },
        accent: {
          50: '#f1f7f3',
          100: '#dcebde',
          200: '#bcd9c0',
          500: '#2d8047',
          600: '#1f6b3a',
          700: '#195830',
          800: '#144526',
          900: '#0e3019',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
