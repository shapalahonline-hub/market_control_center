/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm "paper" canvas — the Claude/Anthropic aesthetic
        paper: '#F7F5F2',
        surface: '#FFFFFF',
        raised: '#FCFBF9',
        // Ink (text)
        ink: '#262421',
        'ink-soft': '#57534E',
        muted: '#8A847C',
        faint: '#B7B1A8',
        // Hairlines / borders
        line: '#E9E4DD',
        'line-soft': '#F0ECE6',
        // Signature coral / book-cloth accent
        clay: {
          50: '#FBF1ED',
          100: '#F6DFD5',
          200: '#EFC3B1',
          300: '#E5A084',
          400: '#DA8160',
          500: '#D97757', // primary accent
          600: '#C25E3F',
          700: '#A14B32',
        },
        // Muted semantics that sit on warm paper
        good: '#5E8C6A',
        'good-bg': '#EAF1EB',
        warn: '#C08A3E',
        'warn-bg': '#F6EEDF',
        bad: '#C2553F',
        'bad-bg': '#F6E6E1',
        info: '#5B7B9A',
        'info-bg': '#E8EEF3',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(38,36,33,0.04), 0 1px 3px rgba(38,36,33,0.03)',
        'card-hover': '0 4px 12px rgba(38,36,33,0.07)',
        pop: '0 8px 28px rgba(38,36,33,0.12)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
}
