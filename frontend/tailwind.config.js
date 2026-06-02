/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#6366F1',
        secondary: '#10B981',
        danger: '#F87171',
        warning: '#FBBF24',
        dark: {
          bg: '#0F172A',
          card: '#1E293B',
          border: '#334155',
          muted: '#475569'
        },
        light: {
          bg: '#FAF5FF',
          card: '#FDF2F8',
          border: '#F3E8FF',
          muted: '#E9D5FF'
        },
        pastel: {
          purple: '#D8B4FE',
          pink: '#F9A8D4',
          blue: '#BFDBFE',
          green: '#BBEDDA',
          yellow: '#FEE2A4',
          rose: '#FBCFE8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        slideLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        slideRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' }
        },
        bounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' }
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        }
      },
      animation: {
        slideUp: 'slideUp 0.35s ease-out',
        fadeIn: 'fadeIn 0.4s ease-out',
        slideDown: 'slideDown 0.35s ease-out',
        slideLeft: 'slideLeft 0.35s ease-out',
        slideRight: 'slideRight 0.35s ease-out',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        bounce: 'bounce 1s infinite',
        shake: 'shake 0.5s ease-in-out',
        scaleIn: 'scaleIn 0.3s ease-out'
      }
    }
  },
  plugins: []
}
