/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shark: {
          bg: '#090A18',
          panel: '#101329',
          card: '#151832',
          elevated: '#1B2040',
          'elevated-hover': '#242b50',
          gold: '#F5B041',
          purple: '#7655F5',
          'purple-dim': '#5746C8',
          blue: '#536CFF',
          text: '#F4F3FF',
          muted: '#999BBE',
          green: '#28C997',
          red: '#E94B64',
        }
      }
    },
  },
  plugins: [],
}
