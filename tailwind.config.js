/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        discord: {
          darkest: '#1e1f22',
          darker: '#2b2d31',
          dark: '#313338',
          hover: '#35373c',
          active: '#404249',
          channel: '#949ba4',
          channelHover: '#dbdee1',
          primary: '#5865F2',
          primaryHover: '#4752C4',
          green: '#23a55a',
          red: '#f23f43',
          yellow: '#f0b232',
          textMuted: '#949ba4',
          textNormal: '#dbdee1',
          textHeader: '#f2f3f5'
        },
        shark: {
          bg: '#090A18',
          panel: '#101329',
          card: '#151832',
          elevated: '#1B2040',
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
