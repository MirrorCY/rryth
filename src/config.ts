import { Dict, Schema, Time } from 'koishi'
import { Size } from './utils'

export const modelMap = {
  safe: 'safe-diffusion',
  nai: 'nai-diffusion',
  furry: 'nai-diffusion-furry',
} as const

export const orientMap = {
  landscape: { height: 512, width: 768 },
  portrait: { height: 768, width: 512 },
  square: { height: 640, width: 640 },
} as const

const ucPreset = [
  'nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers',
  'extra digit, fewer digits, cropped, worst quality, low quality',
  'normal quality, jpeg artifacts, signature, watermark, username, blurry',
].join(', ')

type Model = keyof typeof modelMap
type Orient = keyof typeof orientMap

export const models = Object.keys(modelMap) as Model[]
export const orients = Object.keys(orientMap) as Orient[]

export namespace sampler {
  export const nai = {
    'k_euler_a': 'Euler ancestral',
    'k_euler': 'Euler',
    'k_lms': 'LMS',
    'ddim': 'DDIM',
    'plms': 'PLMS',
  }

  export const sd = {
    'k_euler_a': 'Euler a',
    'k_euler': 'Euler',
    'k_lms': 'LMS',
    'k_heun': 'Heun',
    'k_dpm_2': 'DPM2',
    'k_dpm_2_a': 'DPM2 a',
    'k_dpmpp_2s_a': 'DPM++ 2S a',
    'k_dpmpp_2m': 'DPM++ 2M',
    'k_dpm_fast': 'DPM fast',
    'k_dpm_adaptive': 'DPM adaptive'
  }

  export function createSchema(map: Dict<string>) {
    return Schema.union(Object.entries(map).map(([key, value]) => {
      return Schema.const(key).description(value)
    })).description('默认的采样器。').default('k_euler_a')
  }

}

export interface Options {
  enhance: boolean
  model: string
  resolution: Size
  sampler: string
  seed: string
  steps: number
  scale: number
  noise: number
  strength: number
}

export interface PromptConfig {
  basePrompt?: string
  negativePrompt?: string
  forbidden?: string
  placement?: 'before' | 'after'
  latinOnly?: boolean
  translator?: boolean
  maxWords?: number
}

export const PromptConfig: Schema<PromptConfig> = Schema.object({
  basePrompt: Schema.string().role('textarea').description('默认附加的标签。').default('masterpiece, best quality'),
  negativePrompt: Schema.string().role('textarea').description('默认附加的反向标签。').default(ucPreset),
  forbidden: Schema.string().role('textarea').description('违禁词列表。含有违禁词的请求将被拒绝。').default(''),
  placement: Schema.union([
    Schema.const('before' as const).description('置于最前'),
    Schema.const('after' as const).description('置于最后'),
  ]).description('默认附加标签的位置。').default('after'),
  translator: Schema.boolean().description('是否启用自动翻译。').default(false),
  latinOnly: Schema.boolean().description('是否只接受英文输入。').default(true),
  maxWords: Schema.natural().description('允许的最大单词数量。').default(0),
}).description('输入设置')

export interface Config extends PromptConfig {
  type: 'token' | 'login' | 'naifu' | 'sd-webui'
  token?: string
  email?: string
  password?: string
  model?: Model
  orient?: Orient
  sampler?: string
  maxSteps?: number
  maxResolution?: number
  anatomy?: boolean
  output?: 'minimal' | 'default' | 'verbose'
  allowAnlas?: boolean | number
  endpoint?: string
  headers?: Dict<string>
  maxRetryCount?: number
  requestTimeout?: number
  recallTimeout?: number
  maxConcurrency?: number
}

Schema.const('sd-webui' as const).description('sd-webui')

export const Config = Schema.intersect([

  Schema.object({
    endpoint: Schema.string().description('API 服务器地址。通常无需修改').default('https://stablehorde.net/api/v2/generate/sync'),
    headers: Schema.dict(String).description('apikey 不想注册自己的可以默认。').default({apikey: '0000000000'}),
  }),

  Schema.union([
    Schema.object({
      type: Schema.const('sd-webui'),
      sampler: sampler.createSchema(sampler.sd),
    }).description('参数设置'),
    Schema.object({
      type: Schema.const('naifu'),
      sampler: sampler.createSchema(sampler.nai),
    }).description('参数设置'),
    Schema.object({
      model: Schema.union(models).description('默认的生成模型。').default('nai'),
      sampler: sampler.createSchema(sampler.nai),
    }).description('参数设置'),
  ] as const),

  Schema.object({
    orient: Schema.union(orients).description('默认的图片方向。').default('portrait'),
    maxSteps: Schema.natural().description('允许的最大迭代步数。').default(0),
    maxResolution: Schema.natural().description('生成图片的最大尺寸。').default(0),
  }),

  PromptConfig,

  Schema.object({
    output: Schema.union([
      Schema.const('minimal').description('只发送图片'),
      Schema.const('default').description('发送图片和关键信息'),
      Schema.const('verbose').description('发送全部信息'),
    ]).description('输出方式。').default('default'),
    maxRetryCount: Schema.natural().description('连接失败时最大的重试次数。').default(3),
    requestTimeout: Schema.number().role('time').description('当请求超过这个时间时会中止并提示超时。').default(Time.minute),
    recallTimeout: Schema.number().role('time').description('图片发送后自动撤回的时间 (设置为 0 以禁用此功能)。').default(0),
    maxConcurrency: Schema.number().description('单个频道下的最大并发数量 (设置为 0 以禁用此功能)。').default(0),
  }).description('高级设置'),
]) as Schema<Config>

interface Forbidden {
  pattern: string
  strict: boolean
}

export function parseForbidden(input: string) {
  return input.trim()
    .toLowerCase()
    .replace(/，/g, ',')
    .split(/(?:,\s*|\s*\n\s*)/g)
    .filter(Boolean)
    .map<Forbidden>((pattern: string) => {
      const strict = pattern.endsWith('!')
      if (strict) pattern = pattern.slice(0, -1)
      pattern = pattern.replace(/[^a-z0-9]+/g, ' ').trim()
      return { pattern, strict }
    })
}

const backslash = /@@__BACKSLASH__@@/g

export function parseInput(input: string, config: Config, forbidden: Forbidden[], override: boolean): string[] {
  input = input.toLowerCase()
    .replace(/\\\\/g, backslash.source)
    .replace(/，/g, ',')
    .replace(/（/g, '(')
    .replace(/）/g, ')')

  if (config.type === 'sd-webui') {
    input = input
      .split('\\{').map(s => s.replace(/\{/g, '(')).join('\\{')
      .split('\\}').map(s => s.replace(/\}/g, ')')).join('\\}')
  } else {
    input = input
      .split('\\(').map(s => s.replace(/\(/g, '{')).join('\\(')
      .split('\\)').map(s => s.replace(/\)/g, '}')).join('\\)')
  }

  input = input
    .replace(backslash, '\\')
    .replace(/_/g, ' ')

  if (config.latinOnly && /[^\s\w"'“”‘’.,:|\\()\[\]{}-]/.test(input)) {
    return ['.latin-only']
  }

  const negative = []
  const appendToList = (words: string[], input: string) => {
    const tags = input.split(/,\s*/g)
    if (config.placement === 'before') tags.reverse()
    for (let tag of tags) {
      tag = tag.trim().toLowerCase()
      if (!tag || words.includes(tag)) continue
      if (config.placement === 'before') {
        words.unshift(tag)
      } else {
        words.push(tag)
      }
    }
  }

  // extract negative prompts
  const capture = input.match(/(,\s*|\s+)(-u\s+|--undesired\s+|negative prompts?:\s*)([\s\S]+)/m)
  if (capture?.[3]) {
    input = input.slice(0, capture.index).trim()
    appendToList(negative, capture[3])
  }

  // remove forbidden words
  const positive = input.split(/,\s*/g).filter((word) => {
    word = word.replace(/[^a-z0-9]+/g, ' ').trim()
    if (!word) return false
    for (const { pattern, strict } of forbidden) {
      if (strict && word.split(/\W+/g).includes(pattern)) {
        return false
      } else if (!strict && word.includes(pattern)) {
        return false
      }
    }
    return true
  })

  if (Math.max(getWordCount(positive), getWordCount(negative)) > (config.maxWords || Infinity)) {
    return ['.too-many-words']
  }

  if (!override) {
    appendToList(positive, config.basePrompt)
    appendToList(negative, config.negativePrompt)
  }

  return [null, positive.join(', '), negative.join(', ')]
}

function getWordCount(words: string[]) {
  return words.join(' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').length
}