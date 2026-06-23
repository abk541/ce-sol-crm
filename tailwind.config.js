/** @type {import('tailwindcss').Config} */
//
// Tailwind palette is driven by CSS custom properties so swapping
// `<html data-theme="…">` retones every utility instantly. The legacy
// `space.*` scale below remains as an escape hatch for hardcoded
// gradients, but new code should prefer semantic names like
// `bg-card`, `text-primary`, `border-default`, `shadow-card`,
// `rounded-card`, `font-sans`, etc.
//
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Semantic, theme-driven ────────────────────────────────
        app: 'var(--bg-app)',
        card: 'var(--bg-card)',
        raised: 'var(--bg-raised)',
        modal: 'var(--bg-modal)',
        sidebar: 'var(--bg-sidebar)',
        input: 'var(--bg-input)',
        overlay: 'var(--bg-overlay)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
        muted: 'var(--text-muted)',
        inverse: 'var(--text-inverse)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        'accent-soft': 'var(--accent-soft)',
        success: 'var(--success-fg)',
        warning: 'var(--warning-fg)',
        error: 'var(--error-fg)',
        info: 'var(--info-fg)',
        // ── Legacy hard-coded scale (kept for back-compat) ────────
        space: {
          950: '#01060F',
          900: '#040C1A',
          800: '#070E22',
          700: '#0B1530',
          600: '#101C3A',
          500: '#1A2A50',
          400: '#243660',
        },
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        focus: 'var(--border-focus)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        card: 'var(--radius-card)',
        btn: 'var(--radius-btn)',
        input: 'var(--radius-input)',
        nav: 'var(--nav-radius)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        card: 'var(--shadow-sm)',
        modal: 'var(--shadow-modal)',
        focus: 'var(--shadow-focus)',
        btn: 'var(--shadow-btn-primary)',
      },
      fontFamily: {
        // `font-sans` follows the user override (or theme body font);
        // `font-heading` / `font-mono` follow the active theme only.
        sans: ['var(--app-font)'],
        body: ['var(--font-body)'],
        heading: ['var(--font-heading)'],
        mono: ['var(--font-mono)'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh':
          'linear-gradient(135deg, var(--indigo-600) 0%, var(--accent) 50%, var(--accent-2) 100%)',
        'gradient-card':
          'linear-gradient(135deg, var(--accent-soft) 0%, var(--accent-glow) 100%)',
        shimmer:
          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
      },
      animation: {
        float: 'float 8s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite alternate',
        shimmer: 'shimmer 2.5s linear infinite',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.3s ease-out',
        'spin-slow': 'spin 8s linear infinite',
        orb: 'orb 12s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%': { transform: 'translateY(-15px) rotate(1deg)' },
          '66%': { transform: 'translateY(-8px) rotate(-1deg)' },
        },
        glowPulse: {
          '0%': {
            boxShadow: '0 0 10px rgba(99, 102, 241, 0.2), 0 0 20px rgba(99, 102, 241, 0.1)',
          },
          '100%': {
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.5), 0 0 40px rgba(139, 92, 246, 0.3)',
          },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        orb: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(30px, -20px) scale(1.05)' },
          '50%': { transform: 'translate(-20px, 30px) scale(0.95)' },
          '75%': { transform: 'translate(-30px, -10px) scale(1.02)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
