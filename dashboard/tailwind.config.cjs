/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: '#1e293b',
        input: '#0f172a',
        ring: '#22d3ee',
        background: '#0b1222',
        foreground: '#e2e8f0'
      },
      borderRadius: {
        lg: '12px',
        md: '10px',
        sm: '8px'
      },
      boxShadow: {
        card: '0 20px 45px -25px rgba(15, 23, 42, 0.8)',
        inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)'
      }
    }
  },
  plugins: []
}
