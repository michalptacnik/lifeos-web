import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#131722',
        paper: '#f5f3ef',
        accent: '#0f766e',
        warm: '#c2410c'
      }
    }
  },
  plugins: []
};

export default config;
