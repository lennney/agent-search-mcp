// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'scripts/'],
  },
  {
    rules: {
      // ESM requires .js extensions in imports — disable the no-unused-vars
      // on the import side, TS handles it
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-require-imports': 'error',
      'no-console': 'warn', // MCP servers log to stderr via pino
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off', // tests may use console for diagnostics
      '@typescript-eslint/no-explicit-any': 'off', // test mocks need 'any'
    },
  },
);
