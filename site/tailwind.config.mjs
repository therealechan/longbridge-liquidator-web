/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      colors: {
        // Dark mode tokens
        dark: {
          bg: '#0a0a0a',
          surface: '#171717',
          hover: '#262626',
          border: '#262626',
          fg: '#ededed',
          'fg-secondary': '#d4d4d4',
          muted: '#737373',
          'muted-fg': '#a3a3a3',
          accent: '#fafafa',
          'accent-fg': '#171717',
        },
        // Light mode tokens
        light: {
          bg: '#ffffff',
          surface: '#f4f4f5',
          hover: '#e4e4e7',
          border: '#e4e4e7',
          fg: '#18181b',
          'fg-secondary': '#3f3f46',
          muted: '#71717a',
          'muted-fg': '#a1a1aa',
          accent: '#18181b',
          'accent-fg': '#fafafa',
        },
        danger: '#dc2626',
        'danger-hover': '#b91c1c',
        success: '#16a34a',
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        pill: '100px',
      },
      letterSpacing: {
        tight: '-0.03em',
        wide: '0.05em',
      },
    },
  },
  plugins: [],
};
