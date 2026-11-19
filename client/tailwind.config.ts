import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: token('paper'),
        surface: token('surface'),
        sunken: token('sunken'),
        ink: { DEFAULT: token('ink'), muted: token('ink-muted') },
        rule: { DEFAULT: token('rule'), strong: token('rule-strong') },
        brand: { DEFAULT: token('brand'), ink: token('brand-ink'), soft: token('brand-soft') },
        navy: token('navy'),
        lavender: { DEFAULT: token('lavender'), soft: token('lavender-soft') },
        ok: { DEFAULT: token('ok'), soft: token('ok-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
      },
      fontFamily: { sans: ['"Geist Variable"', 'system-ui', 'sans-serif'] },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        lg: ['20px', '28px'],
        xl: ['24px', '30px'],
        '2xl': ['32px', '38px'],
        '3xl': ['44px', '48px'],
      },
      borderRadius: { control: '8px', panel: '12px' },
      boxShadow: { panel: 'var(--shadow-panel)' },
    },
  },
  plugins: [],
} satisfies Config;
