import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'

// 工具名
export const name = 'text-stats'
// 配置需要的依赖
export const inject = ['tools']

export interface Config {
  defaultTopWords: number
  caseSensitive: boolean
}

export const Config: Schema<Config> = Schema.object({
  defaultTopWords: Schema.natural().min(1).max(20).default(5),
  caseSensitive: Schema.boolean().default(false),
})

export interface WordCount {
  word: string
  count: number
}

export interface TextStats {
  characters: number
  words: number
  lines: number
  topWords: WordCount[]
}

// Unicode 字母、数字与词内撇号构成一个词；标点、空白和换行都是分隔符。
// "Hello, 世界! don't 123".match(/[\p{L}\p{N}']+/gu)
// ["Hello", "世界", "don't", "123"]
const WORD_PATTERN = /[\p{L}\p{N}']+/gu

/**
 * 统计一段文本的字符数、词数、行数与高频词。
 * @param text - 待统计的文本。
 * @param topWords - 返回的词频条目上限（调用前已收敛到 1..20）。
 * @param caseSensitive - 为 `false` 时先折叠大小写再计数。
 * @returns 规范 JSON 结果，字段与 `TextStats` 一致。
 */
export function analyse(text: string, topWords: number, caseSensitive: boolean): TextStats {
  // 从文本出匹配出所有的单词
  const words = (text.match(WORD_PATTERN) ?? []).map(word => caseSensitive ? word : word.toLowerCase())

  // 统计每个单词出现的频度（次数）
  const counts = new Map<string, number>()
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1)

  // 降序排列取前topWords个记录
  const ranked = [...counts]
    .map(([word, count]) => ({ word, count }))
    .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word))
    .slice(0, topWords)

  return {
    // 文本字符长度
    characters: [...text].length,
    // 单词数量
    words: words.length,
    // 行数
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
    // 高频词
    topWords: ranked,
  }
}

/**
 * 注册 `text_stats` 工具。注册是副作用：dispose 插件 fiber 即注销该工具。
 * @param ctx - 插件上下文，`inject` 保证 `ctx.tools` 可用。
 * @param config - 已按 `Config` schema 校验并填好默认值的部署配置。
 */
export function apply(ctx: Context, config: Config) {
  ctx.tools.register(defineTool({
    name: 'text_stats',
    description: 'Count the characters, words and lines of a text and list its most frequent words.',
    parameters: {
      text: { type: 'string', required: true, description: 'The text to analyse.' },
      topWords: { type: 'integer', description: 'How many frequent words to list, 1-20. Defaults to the plugin configuration.' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          characters: { type: 'integer', required: true, description: 'Number of Unicode code points.' },
          words: { type: 'integer', required: true },
          lines: { type: 'integer', required: true },
          topWords: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                word: { type: 'string', required: true },
                count: { type: 'integer', required: true },
              },
            },
          },
        },
        additionalProperties: false,
      },
      // 模型只看到这里返回的内容；规范值本身仍供程序化调用方读取。
      render: (_args, value) => {
        const summary = `${value.characters} characters, ${value.words} words, ${value.lines} lines`
        if (value.topWords.length === 0) return [{ type: 'text', text: summary }]
        const frequent = value.topWords.map(entry => `${entry.word} (${entry.count})`).join(', ')
        return [{ type: 'text', text: `${summary}. Most frequent: ${frequent}` }]
      },
    },
    // 参数已由 defineTool 按上面的 parameters 校验，这里只需处理 schema 表达不了的约束。
    async execute(args) {
      const requested = args.topWords ?? config.defaultTopWords
      // 限制top数量的范围在1-20
      const topWords = Math.min(20, Math.max(1, Math.trunc(requested)))
      return analyse(args.text, topWords, config.caseSensitive)
    },
  }))
}
