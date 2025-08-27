// tailwind.config.cjs
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter','system-ui','Segoe UI','Roboto','Ubuntu','Helvetica Neue','Arial','sans-serif'],
      },
    },
  },
  plugins: [],
}
