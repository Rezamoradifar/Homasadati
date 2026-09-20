import type {Config} from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', './.storybook/**/*.{ts,tsx}'],
  theme: {extend: {}}, plugins: []
} satisfies Config;
