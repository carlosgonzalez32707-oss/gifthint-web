/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── GiftHint dark palette — mirrors tokens.ts ─────────────────────────
        bg:       '#0C0C0E',
        surface:  '#141418',
        surface2: '#1C1C22',
        surface3: '#242430',

        // Text
        text:     '#F0EEE8',
        muted:    '#7A7870',

        // Accent — purple
        purple: {
          DEFAULT: '#8B83F0',
          dim:     'rgba(139,131,240,0.13)',
          soft:    'rgba(139,131,240,0.22)',
          ring:    'rgba(139,131,240,0.28)',
          glow:    'rgba(139,131,240,0.18)',
        },

        // Semantic
        green:  '#4EC99A',
        amber:  '#F5A94E',
        pink:   '#F472B6',
        teal:   '#38BDF8',
        red:    '#E24B4A',

        // Borders
        border:     'rgba(240,238,232,0.07)',
        borderSoft: 'rgba(240,238,232,0.12)',
      },
      fontFamily: {
        sans: ['System'],
      },
      borderRadius: {
        xs:   4,
        sm:   6,
        md:   12,
        lg:   16,
        xl:   20,
        pill: 999,
      },
    },
  },
  plugins: [],
}
