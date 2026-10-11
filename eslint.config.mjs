import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', '.superpowers/**'],
  },
  {
    rules: {
      // core 必须保持平台无关，误引入 Node 模块时给出提示
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            { name: 'fs', message: 'core 包不得依赖 Node API' },
            { name: 'path', message: 'core 包不得依赖 Node API' },
          ],
        },
      ],
    },
  },
];
