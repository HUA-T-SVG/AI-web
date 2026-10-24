import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint 扁平配置（Next 16 起 `next lint` 已移除，直接用 eslint CLI）。
 *
 * 注意不要再用 `FlatCompat` 去 extend `next/core-web-vitals`：Next 16 的
 * eslint-config-next 本身就是 flat config 数组，经 FlatCompat 再包装会触发
 * @eslint/eslintrc 的循环结构报错（`Converting circular structure to JSON`）。
 */
export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', '.superpowers/**', 'test-results/**'],
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
