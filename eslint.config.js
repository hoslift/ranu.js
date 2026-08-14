// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  {
    files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
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
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Rules applied to all TypeScript files (non-type-aware)
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Correctness
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      'no-undef': 'off',

      // Code quality
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      'prefer-const': 'warn',
    },
  },
  {
    // Type-aware rules applied only to TypeScript source files under src/
    files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/consistent-type-exports': 'warn',

      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
  {
    // Test files — relax some rules
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
  {
    // Scripts — relax type-checked rules
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
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
