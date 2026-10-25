import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

// 入口与输出都用本文件位置推导，因此从仓库根目录还是插件目录调用结果一致。
const packageRoot = dirname(fileURLToPath(import.meta.url))

/**
 * 从 src/ 直接构建发布入口。只转译、不做类型检查、不依赖项目引用，
 * 因此 `prepare` 在 git 安装后的孤立目录里也能跑通。
 */
export default defineConfig({
  entry: [resolve(packageRoot, 'src/index.ts')],
  outDir: resolve(packageRoot, 'lib'),
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  // dsh 本体包必须留在外部，运行时由当前安装提供同一份实例。
  deps: { neverBundle: [/^@deepseek-ai\//] },
})
