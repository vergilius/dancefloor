import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // libredwg-web is GPL-3.0: only the DWG worker may import it (PLAN.md §2).
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@mlightcad/libredwg-web', '@mlightcad/libredwg-web/*'], message: 'Only src/worker/dwg.worker.ts may import libredwg-web.' }] },
      ],
    },
  },
  {
    files: ['src/worker/dwg.worker.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
