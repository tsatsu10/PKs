import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { a11yBaseline } from './eslint.a11y-baseline.js'

export default defineConfig([
  globalIgnores(['dist', 'src/data/database.types.ts']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    files: ['src/**/*.{jsx,tsx}'],
    ignores: a11yBaseline,
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['src/components/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/features/**'],
          message: 'components/ must not import features/; move shared code to lib/ or the component into its feature.',
        }],
      }],
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/data/**', 'src/**/*.test.*', 'src/test/**'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          // supabase.from('x').select(...) — a read. Writes chain .insert/.update/.delete/.upsert first.
          selector: "CallExpression[callee.property.name='select'] > MemberExpression.callee > CallExpression.object[callee.object.name='supabase'][callee.property.name='from']",
          message: 'Supabase reads belong in src/data (see docs/superpowers/specs/2026-10-13-phase-0a-part1-data-layer-design.md).',
        },
        {
          // supabase.rpc('name') for anything that isn't a known write.
          selector: "CallExpression[callee.object.name='supabase'][callee.property.name='rpc'][arguments.0.value!=/^(create_domain|create_tag|touch_object_view|delete_object_permanently|share_object_by_email|save_prompt_output_as_object|report_client_error|snapshot_knowledge_object)$/]",
          message: 'Supabase read RPCs belong in src/data. If this RPC writes, add it to the allow-list in eslint.config.js.',
        },
      ],
    },
  },
])
