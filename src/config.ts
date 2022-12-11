import { Dict, Schema, Time } from 'koishi'
import { Size } from './utils'

// export const modelMap = {
//   'Anything 3.0': 'Anything Diffusion',
//   'Hentai Diffusion': 'Hentai Diffusion',
//   'Stable Diffusion 1.5': 'stable_diffusion',
//   'Stable Diffusion 2.0': 'stable_diffusion_2.0',
//   'Midjourney Diffusion': 'Midjourney Diffusion',
// } as const




const ucPreset = [
  'nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers',
  'extra digit, fewer digits, cropped, worst quality, low quality',
  'normal quality, jpeg artifacts, signature, watermark, username, blurry',
].join(', ')



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
    'k_dpm_ad': 'DPM adaptive',
    'k_lms_ka': 'LMS Karras',
    'k_dpm_2_ka': 'DPM2 Karras',
    'k_dpm_2_a_ka': 'DPM2 a Karras',
    'k_dpmpp_2s_a_ka': 'DPM++ 2S a Karras',
    'k_dpmpp_2m_ka': 'DPM++ 2M Karras',
    'ddim': 'DDIM',
    'plms': 'PLMS',
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
}

export const PromptConfig: Schema<PromptConfig> = Schema.object({
  basePrompt: Schema.string().role('textarea').description('默认附加的标签。').default('masterpiece, best quality'),
  negativePrompt: Schema.string().role('textarea').description('默认附加的反向标签。').default(ucPreset),
  forbidden: Schema.string().role('textarea').description('违禁词列表。请求中的违禁词将会被自动删除。').default(''),
  placement: Schema.union([
    Schema.const('before' as const).description('置于最前'),
    Schema.const('after' as const).description('置于最后'),
  ]).description('默认附加标签的位置。').default('after'),
  translator: Schema.boolean().description('是否启用自动翻译。').default(false),
  latinOnly: Schema.boolean().description('是否只接受英文输入。').default(true),
}).description('输入设置')

export interface Config extends PromptConfig {
  updateInfo?: boolean
  token?: string
  email?: string
  password?: string
  sampler?: string
  maxSteps?: number
  maxBatch?: number
  maxResolution?: number
  anatomy?: boolean
  output?: 'default' | 'verbose' | 'minimal'
  allowAnlas?: boolean | number
  enableUpscale?: boolean
  endpoint?: string
  headers?: Dict<string>
  requestTimeout?: number
  recallTimeout?: number
  maxConcurrency?: number
  weigh?: number
  hight?: number
  steps?: number
}

export const Config = Schema.intersect([
  Schema.union([
    Schema.object({
      sampler: sampler.createSchema(sampler.sdh),
    }).description('参数设置'),
  ] as const),

  Schema.object({
    weigh: Schema.number().description('默认宽度').default(512).max(960),
    hight: Schema.number().description('默认宽度').default(512).max(960),
    steps: Schema.number().description('默认步数').default(28).max(50),
    // 服务器将限制单次绘制量为 960*960*50 超过此数值的将视为非法请求并被封禁。
  }),

  PromptConfig,

  Schema.object({
    output: Schema.union([
      Schema.const('minimal').description('仅图片'),
      Schema.const('default').description('标准输出'),
      Schema.const('verbose').description('详细输出'),
    ]).description('输出方式。').default('default'),
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

  if (!override) {
    appendToList(positive, config.basePrompt)
    appendToList(negative, config.negativePrompt)
  }

  return [null, positive.join(', '), negative.join(', ')]
}
