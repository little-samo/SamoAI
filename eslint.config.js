import path from 'node:path';
import { fileURLToPath } from 'node:url';

import typescriptEslintEslintPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  ...compat.extends(
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ),
  {
    plugins: {
      '@typescript-eslint': typescriptEslintEslintPlugin,
      'unused-imports': unusedImports,
      import: importPlugin,
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },

      parser: tsParser,

      parserOptions: {
        project: path.join(__dirname, 'tsconfig.json'),
        tsconfigRootDir: __dirname,
      },
    },

    rules: {
      'unused-imports/no-unused-imports': 'error',
      'import/order': [
        'error',
        {
          'newlines-between': 'always',
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'explicit',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },

    ignores: ['node_modules', 'dist'],
  },
];
