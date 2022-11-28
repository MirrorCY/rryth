import { Context, Dict, Logger, Quester, segment, Session } from 'koishi'
import { Config, modelMap, models, orientMap, parseForbidden, parseInput, sampler } from './config'
import { ImageData } from './types'
import { closestMultiple, download, getImageSize, NetworkError, resizeInput, Size } from './utils'
import { } from '@koishijs/translator'
import { } from '@koishijs/plugin-help'
import sharp from 'sharp'


export * from './config'

export const reactive = true
export const name = 'rryth'

const logger = new Logger(name)

function handleError(session: Session, err: Error) {
  if (Quester.isAxiosError(err)) {
    if (err.response?.data) {
      logger.error(err.response.data)
      return session.text(err.response.data.message)
    }
    if (err.response?.status === 402) {
      return session.text('.unauthorized')
    } else if (err.response?.status) {
      return session.text('.response-error', [err.response.status])
    } else if (err.code === 'ETIMEDOUT') {
      return session.text('.request-timeout')
    } else if (err.code) {
      return session.text('.request-failed', [err.code])
    }
  }
  logger.error(err)
  return session.text('.unknown-error')
}

interface Forbidden {
  pattern: string
  strict: boolean
}

export function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh', require('./locales/zh'))

  let forbidden: Forbidden[]
  const tasks: Dict<Set<string>> = Object.create(null)
  const globalTasks = new Set<string>()

  ctx.accept(['forbidden'], (config) => {
    forbidden = parseForbidden(config.forbidden)
  }, { immediate: true })

  const thirdParty = () => !['login', 'token'].includes(config.type)

  const restricted = (session: Session<'authority'>) => {
    if (thirdParty()) return false
    if (typeof config.allowAnlas === 'boolean') {
      return !config.allowAnlas
    } else {
      return session.user.authority < config.allowAnlas
    }
  }

  const step = (source: string) => {
    const value = +source
    if (value * 0 === 0 && Math.floor(value) === value && value > 0 && value <= (config.maxSteps || Infinity)) return value
    throw new Error()
  }

  const batch = (source: string) => {
    const value = +source
    if (value * 0 === 0 && Math.floor(value) === value && value > 0 && value <= (config.maxBatch || 5)) return value
    throw new Error()
  }

  const resolution = (source: string, session: Session<'authority'>): Size => {
    if (source in orientMap) return orientMap[source]
    if (restricted(session)) throw new Error()
    const cap = source.match(/^(\d+)[x×](\d+)$/)
    if (!cap) throw new Error()
    const width = closestMultiple(+cap[1])
    const height = closestMultiple(+cap[2])
    if (Math.max(width, height) > (config.maxResolution || Infinity)) {
      throw new Error()
    }
    return { width, height }
  }

  const cmd = ctx.command('rryth <prompts:text>')
    .alias('sai')
    .alias('rr')
    .alias('人人')
    .userFields(['authority'])
    .option('model', '-m <model>', { type: models })
    .option('resolution', '-r <resolution>', { type: resolution })
    .option('override', '-O')
    .option('sampler', '-s <sampler>')
    .option('seed', '-x <seed:number>')
    .option('steps', '-t <step>', { type: step })
    .option('scale', '-c <scale:number>')
    .option('strength', '-N <strength:number>')
    .option('undesired', '-u <undesired>')
    .option('batch', '-b <batch:number>', { type: batch })
    .action(async ({ session, options }, input) => {
      if (!input?.trim()) return session.execute('help rryth')

      let imgUrl: string, image: ImageData
      if (!restricted(session)) {
        input = segment.transform(input, {
          image(attrs) {
            imgUrl = attrs.url
            return ''
          },
        })

        if (!input.trim() && !config.basePrompt) {
          return session.text('.expect-prompt')
        }
      } else {
        delete options.steps
      }

      if (config.translator && ctx.translator) {
        try {
          input = await ctx.translator.translate({ input, target: 'en' })
        } catch (err) {
          logger.warn(err)
        }
      }

      const [errPath, prompt, uc] = parseInput(input, config, forbidden, options.override)
      if (errPath) return session.text(errPath)

      const model = modelMap[options.model]
      const seed = options.seed || Math.floor(Math.random() * Math.pow(2, 32))

      const parameters: Dict = {
        seed,
        prompt,
        uc,
        batch: options.batch ?? 1
      }

      if (imgUrl) {
        try {
          image = await download(ctx, imgUrl)
        } catch (err) {
          if (err instanceof NetworkError) {
            return session.text(err.message, err.params)
          }
          logger.error(err)
          return session.text('.download-error')
        }

        Object.assign(parameters, {
          scale: options.scale ?? 11,
          steps: options.steps ?? 50,
        })

        options.resolution ||= resizeInput(getImageSize(image.buffer))
        Object.assign(parameters, {
          height: options.resolution.height,
          width: options.resolution.width,
          strength: options.strength ?? 0.3,
        })

      } else {
        options.resolution ||= orientMap[config.orient]
        Object.assign(parameters, {
          height: options.resolution.height,
          width: options.resolution.width,
          scale: options.scale ?? 7,
          steps: options.steps ?? 20,
        })
      }

      const id = Math.random().toString(36).slice(2)
      if (config.maxConcurrency) {
        const store = tasks[session.cid] ||= new Set()
        if (store.size >= config.maxConcurrency) {
          return session.text('.concurrent-jobs')
        } else {
          store.add(id)
        }
      }

      session.send(globalTasks.size
        ? session.text('.pending', [globalTasks.size])
        : session.text('.waiting'))

      // ctx.http.axios('https://stablehorde.net/api/v2/status/models', {
      //   method: 'GET',
      //   timeout: config.requestTimeout
      // }).then((res) => {
      //   if (res.data ?) {
      //     res.data[res.data.find(element => element.name === 'Anything Diffusion')]
      //   }

      //   session.send(session.text(res.data))
      // })

      globalTasks.add(id)
      const cleanUp = () => {
        tasks[session.cid]?.delete(id)
        globalTasks.delete(id)
      }
      const data = (() => {
        const body = {
          prompt: parameters.prompt + ' ### ' + parameters.uc,
          nsfw: false,
          censor_nsfw: false,
          models: [parameters.model ?? model],
          params: {
            sampler_name: Object.keys(sampler.sdh)[options.sampler],
            cfg_scale: parameters.scale,
            denoising_strength: parameters.strength,
            seed: parameters.seed.toString(),
            height: parameters.height,
            width: parameters.width,
            steps: parameters.steps,
            n: parameters.batch,
            seed_variation: 1,
            karras: true //听说事魔法
          }
        }
        if (image) {
          body['source_image'] = image?.base64
          body['source_processing'] = 'img2img'
        }
        if (config.enableUpscale) {
          body.params['post_processing'] = ['RealESRGAN_x4plus']
        }
        return body
      })()

      const request = () => ctx.http.axios(config.endpoint, {
        method: 'POST',
        timeout: config.requestTimeout,
        headers: {
          ...config.headers,
        },
        data,
      }).then((res) => {
        return res.data
      })

      let ret, count = 0  //any 是不好的  //会改的
      while (true) {
        try {
          ret = await request()
          cleanUp()
          break
        } catch (err) {
          if (Quester.isAxiosError(err)) {
            if (err.code && err.code !== 'ETIMEDOUT' && ++count < config.maxRetryCount) {
              continue
            }
          }
          cleanUp()
          return handleError(session, err)
        }
      }

      async function getContent() {
        // if (config.output === 'minimal') return segment.image('base64://' + base64)
        const attrs = {
          userId: session.userId,
          nickname: session.author?.nickname || session.username,
        }
        const result = segment('figure')
        const lines = [`种子 = ${seed}`]
        if (config.output === 'verbose') {

          lines.push(`model = ${model}`)
          lines.push(
            `采样器 = ${options.sampler}`,
            `迭代步数 = ${parameters.steps}`,
            `提示词相关度 = ${parameters.scale}`,
          )
          if (parameters.image) {
            lines.push(
              `图转图强度 = ${parameters.strength}`,
            )
          }
        }
        result.children.push(segment('message', attrs, lines.join('\n')))
        result.children.push(segment('message', attrs, `关键词 = ${prompt}`))
        if (config.output === 'verbose') {
          result.children.push(segment('message', attrs, `排除关键词 = ${uc}`))
          result.children.push(segment('message', attrs, `消耗点数 = ${ret.kudos}`))
        }
        
        await Promise.all(
        ret.generations.map(async item => {
          let buffer = Buffer.from(item.img, 'base64')
          await sharp(buffer)
            .png()
            .normalise()
            .modulate({
              saturation: 1.1
            })
            .toBuffer()
            .then(data => {
              result.children.push(segment('message', attrs, segment.image(data)))
            })
            .catch(err => { logger.error(err) })
          if (config.output === 'verbose') result.children.push(segment('message', attrs, `工作站名称 = ${item.worker_name}`))
        }))

        return result
      }

      const ids = await session.send(await getContent())

      if (config.recallTimeout) {
        ctx.setTimeout(() => {
          for (const id of ids) {
            session.bot.deleteMessage(session.channelId, id)
          }
        }, config.recallTimeout)
      }
    })

  ctx.accept(['model', 'orient', 'sampler'], (config) => {
    cmd._options.model.fallback = config.model
    cmd._options.sampler.fallback = config.sampler
    cmd._options.sampler.type = Object.keys(sampler.sdh)
  }, { immediate: true })
}
