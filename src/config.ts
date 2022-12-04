import { Dict, Schema, Time } from 'koishi'
import { Size } from './utils'

export const modelMap = {
  'Anything 3.0': 'Anything Diffusion',
  'Hentai Diffusion': 'Hentai Diffusion',
  'Stable Diffusion 1.5': 'stable_diffusion',
  'Stable Diffusion 2.0': 'stable_diffusion_2.0',
  'Midjourney Diffusion': 'Midjourney Diffusion',
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

  export const sdh = {
    'k_euler_a': 'Euler a',
    'k_euler': 'Euler',
    'k_lms': 'LMS',
    'k_heun': 'Heun',
    'k_dpm_2': 'DPM2',
    'k_dpm_2_a': 'DPM2 a',
    'k_dpmpp_2s_a': 'DPM++ 2S a',
    'k_dpmpp_2m': 'DPM++ 2M',
    'k_dpm_fast': 'DPM fast',
    'k_dpm_adaptive': 'DPM adaptive',
    'dpmsolver': 'DPM solver'
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
  nsfw?: boolean
  translator?: boolean
  maxWords?: number
}

export const PromptConfig: Schema<PromptConfig> = Schema.object({
  basePrompt: Schema.string().role('textarea').description('默认附加的标签。').default('masterpiece, best quality'),
  negativePrompt: Schema.string().role('textarea').description('默认附加的反向标签。').default(ucPreset),
  forbidden: Schema.string().role('textarea').description('违禁词列表。请求中的违禁词将会被自动删除。').default(''),
  placement: Schema.union([
    Schema.const('before' as const).description('置于最前'),
    Schema.const('after' as const).description('置于最后'),
  ]).description('默认附加标签的位置。').default('after'),
  nsfw: Schema.boolean().description('是否跳过 R18 审查，没什么明显作用。').default(false),
  translator: Schema.boolean().description('是否启用自动翻译。').default(false),
  latinOnly: Schema.boolean().description('是否只接受英文输入。').default(true),
}).description('输入设置')

export interface Config extends PromptConfig {
  updateInfo?: boolean
  token?: string
  email?: string
  password?: string
  model?: Model
  orient?: Orient
  sampler?: string
  maxSteps?: number
  maxBatch?: number
  maxResolution?: number
  anatomy?: boolean
  output?: 'default' | 'verbose'
  allowAnlas?: boolean | number
  enableUpscale?: boolean
  endpoint?: string
  headers?: Dict<string>
  maxRetryCount?: number
  requestTimeout?: number
  recallTimeout?: number
  maxConcurrency?: number
}

export const Config = Schema.intersect([
  Schema.object({
    updateInfo: Schema.boolean().description('关闭更新提示，谢谢你喜欢人人有图画项目！(目前插件有点小问题，所有设置需要重启 koishi 才能应用，期待更新。)').default(false),
    // endpoint: Schema.string().description('API 服务器地址，通常无需修改。').default('https://stablehorde.net/api/v2/generate/sync'),
    // headers: Schema.dict(String).description('apikey 不想 [获取自己的](https://stablehorde.net/register) 可以默认。').default({ apikey: 'Kd_oa9Oj7GJF7rGLYUH0xg' }),
  }),

  Schema.union([
    Schema.object({
      model: Schema.union(models).description('默认的生成模型。[Models 中有介绍和更多模型](https://aqualxx.github.io/stable-ui/workers) <br /> ' +
        '如果有你想要但是没加进来的模型，[加群](https://simx.elchapo.cn/NovelAI.png)大喊 42 <br /> ' +
        '下一个版本将空格修改为下划线，需要进来重新配置默认模型，否则无法启动插件').default('Anything 3.0'),
      sampler: sampler.createSchema(sampler.sdh),
    }).description('参数设置'),
  ] as const),

  Schema.object({
    orient: Schema.union(orients).description('默认的图片方向。').default('portrait'),
    maxSteps: Schema.natural().description('允许的最大迭代步数。').default(50),
    // maxBatch: Schema.natural().description('允许批量生成的图片数，通常默认值足够，增加此参数可能会成倍的提高服务器负载，并有可能最终导致大家都没图画，请三思。').default(5),
    maxResolution: Schema.natural().description('生成图片的最大尺寸。').default(1024),
    enableUpscale: Schema.boolean().description('是否启用超采样，降低出图速度，大幅提升出图质量。').default(true),
  }),

  PromptConfig,

  Schema.object({
    output: Schema.union([
      Schema.const('default').description('标准输出'),
      Schema.const('verbose').description('详细输出'),
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

  input = input
    .split('\\{').map(s => s.replace(/\{/g, '(')).join('\\{')
    .split('\\}').map(s => s.replace(/\}/g, ')')).join('\\}')

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

  if (Math.max(getWordCount(positive), getWordCount(negative)) > 75) {
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
