import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config = {
  darkMode: ['class'],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        satoshi: ['var(--font-satoshi)', ...fontFamily.sans],
        monorama: ['var(--font-monorama)', ...fontFamily.sans],
      },
      fontSize: {
        'display-2xl': [
          'var(--display-2xl-font-size)',
          { lineHeight: 'var(--display-2xl-line-height)', letterSpacing: 'var(--display-2xl-letter-spacing)' },
        ],
        'display-xl': [
          'var(--display-xl-font-size)',
          { lineHeight: 'var(--display-xl-line-height)', letterSpacing: 'var(--display-xl-letter-spacing)' },
        ],
        'display-lg': [
          'var(--display-lg-font-size)',
          { lineHeight: 'var(--display-lg-line-height)', letterSpacing: 'var(--display-lg-letter-spacing)' },
        ],
        'display-md': [
          'var(--display-md-font-size)',
          { lineHeight: 'var(--display-md-line-height)', letterSpacing: 'var(--display-md-letter-spacing)' },
        ],
        'display-sm': ['var(--display-sm-font-size)', { lineHeight: 'var(--display-sm-line-height)' }],
        'display-xs': ['var(--display-xs-font-size)', { lineHeight: 'var(--display-xs-line-height)' }],
        'text-xl': ['var(--text-xl-font-size)', { lineHeight: 'var(--text-xl-line-height)' }],
        'text-lg': ['var(--text-lg-font-size)', { lineHeight: 'var(--text-lg-line-height)' }],
        'text-md': ['var(--text-md-font-size)', { lineHeight: 'var(--text-md-line-height)' }],
        'text-sm': ['var(--text-sm-font-size)', { lineHeight: 'var(--text-sm-line-height)' }],
        'text-xs': ['var(--text-xs-font-size)', { lineHeight: 'var(--text-xs-line-height)' }],
        'text-2xs': ['var(--text-2xs-font-size)', { lineHeight: 'var(--text-2xs-line-height)' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        gray: {
          1: '#0C0C0C',
          3: '#131313',
          4: '#303030',
          5: '#313131',
          6: '#3A3A3A',
          7: '#484848',
          8: '#606060',
          9: '#6E6E6E',
          10: '#7B7B7B',
          11: '#B4B4B4',
          12: '#EEEEEE',
        },
        red: {
          3: '#3B150E',
          4: '#520F05',
          5: '#631609',
          6: '#732416',
          7: '#DA1D00',
          9: '#E22901',
          10: '#CA2600',
          11: '#FF8F76',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

export default config;
