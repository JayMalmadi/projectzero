/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:  '#0a0e1a',
          card:  '#0f1628',
          border:'#1e2d4a',
          accent:'#00d4ff',
          green: '#00e676',
          red:   '#ff3d57',
          amber: '#ffab00',
          text:  '#e2e8f0',
          muted: '#64748b',
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      }
    }
  },
  plugins: []
}
