/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#01060F',
          900: '#040C1A',
          800: '#070E22',
          700: '#0B1530',
          600: '#101C3A',
          500: '#1A2A50',
          400: '#243660',
        },
        accent: {
          indigo: '#6366F1',
          violet: '#8B5CF6',
          cyan: '#22D3EE',
          emerald: '#34D399',
          amber: '#FBBF24',
          rose: '#FB7185',
          fuchsia: '#E879F9',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #22D3EE 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.05) 100%)',
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
      },
      animation: {
        'float': 'float 8s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite alternate',
        'shimmer': 'shimmer 2.5s linear infinite',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.3s ease-out',
        'spin-slow': 'spin 8s linear infinite',
        'orb': 'orb 12s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%': { transform: 'translateY(-15px) rotate(1deg)' },
          '66%': { transform: 'translateY(-8px) rotate(-1deg)' },
        },
        glowPulse: {
          '0%': { boxShadow: '0 0 10px rgba(99, 102, 241, 0.2), 0 0 20px rgba(99, 102, 241, 0.1)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.5), 0 0 40px rgba(139, 92, 246, 0.3)' },
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
      boxShadow: {
        'glow-sm': '0 0 10px rgba(99, 102, 241, 0.3)',
        'glow-md': '0 0 20px rgba(99, 102, 241, 0.4), 0 0 40px rgba(139, 92, 246, 0.2)',
        'glow-lg': '0 0 40px rgba(99, 102, 241, 0.5), 0 0 80px rgba(139, 92, 246, 0.3)',
        'glow-cyan': '0 0 20px rgba(34, 211, 238, 0.4)',
        'glow-emerald': '0 0 20px rgba(52, 211, 153, 0.4)',
        'glow-rose': '0 0 20px rgba(251, 113, 133, 0.4)',
        'glow-amber': '0 0 20px rgba(251, 191, 36, 0.4)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255,255,255,0.04) inset',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255,255,255,0.08) inset',
        'modal': '0 24px 80px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255,255,255,0.06) inset',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
