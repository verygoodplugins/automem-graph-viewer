/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Distinctive trio — none are Inter/Roboto/system
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // --- Memory type colors (the only saturated hues; do not touch) ---
        decision: '#3B82F6',
        pattern: '#10B981',
        preference: '#8B5CF6',
        style: '#EC4899',
        habit: '#F59E0B',
        insight: '#F97316',
        context: '#6B7280',
        memory: '#94A3B8',

        // --- Semantic instrument tokens (sourced from CSS vars in index.css) ---
        void: 'var(--void)',
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          2: 'var(--text-secondary)',
          3: 'var(--text-muted)',
          4: 'var(--text-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dim: 'var(--accent-dim)',
        },
        hairline: 'var(--hairline)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        'elev-1': 'var(--elev-1)',
        'elev-2': 'var(--elev-2)',
        'elev-focus': 'var(--elev-focus)',
      },
      transitionTimingFunction: {
        instrument: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px currentColor' },
          '100%': { boxShadow: '0 0 20px currentColor' },
        },
      },
    },
  },
  plugins: [],
}
