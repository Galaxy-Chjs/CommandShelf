import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/** Globals available to the plain-JavaScript files in scripts/. */
const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  __dirname: 'readonly',
  // Playwright `page.evaluate` callbacks are browser code that happens to live
  // in these files.
  window: 'readonly',
  document: 'readonly',
}

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'coverage/**',
      'docs/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // TypeScript already reports unknown identifiers, and does it with types
      // rather than a hand-maintained global list.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // ---------------------------------------------------------------------
      // React hooks.
      //
      // `set-state-in-effect` comes from the React Compiler rule set. This
      // project does not run the compiler, and the flagged sites are all the
      // "synchronise derived state with a prop or an external system" pattern
      // that effects exist for. The rule is off rather than papered over with
      // disable comments so the remaining hook rules stay meaningful.
      // ---------------------------------------------------------------------
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      // ui.tsx intentionally exports `cx` and `useToast` next to the
      // components that use them; splitting them out would cost more than the
      // slightly slower hot reload it buys.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: NODE_GLOBALS },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['*.config.{ts,mjs}', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
)
