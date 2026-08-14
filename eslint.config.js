// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Correctness
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Imports / package boundaries
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../*'],
              message: 'Avoid deep relative imports across package boundaries. Use workspace package imports.',
            },
          ],
        },
      ],

      // Code quality
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Test files — relax some rules
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    // Scripts — relax type-checked rules
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Ignore generated/build output
    ignores: [
      '**/dist/**',
      '**/.ranu/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'pnpm-lock.yaml',
    ],
  },
);
