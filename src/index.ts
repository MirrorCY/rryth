import { Context, Dict, Logger, Quester, segment, Session } from 'koishi'
import { Config, parseForbidden, parseInput } from './config'
import { ImageData } from './types'
import { download, getImageSize, NetworkError, Size, stripDataPrefix } from './utils'
import { } from '@koishijs/translator'
import { } from '@koishijs/plugin-help'


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


  const resolution = (source: string): Size => {
    const cap = source.match(/^(\d*\.?\d+)[x×](\d*\.?\d+)$/)
    logger.info(cap)
    if (!cap) throw new Error()
    const width = +cap[1]
    const height = +cap[2]
    return { width, height }
  }

  const cmd = ctx.command('rryth <prompts:text>')
    .alias('sai', 'rr')
    .userFields(['authority'])
    .option('resolution', '-r <resolution>', { type: resolution })
    .option('override', '-O')
    .option('seed', '-x <seed:number>')
    .option('scale', '-c <scale:number>')
    .option('strength', '-N <strength:number>')
    .option('undesired', '-u <undesired>')
    .action(async ({ session, options }, input) => {

      if (!input?.trim()) return session.execute('help rryth')

      let imgUrl: string, image: ImageData
      input = segment.transform(input, {
        image(attrs) {
          imgUrl = attrs.url
          return ''
        },
      })

      if (!input.trim() && !config.basePrompt) {
        return session.text('.expect-prompt')
      }


      if (config.translator && ctx.translator) {
        const zhPromptMap: string[] = /[一-龟]+/g.exec(input)
        if (zhPromptMap.length > 0) {
          try {
            const translatedMap = (await ctx.translator.translate({ input: zhPromptMap.join(','), target: 'en' })).toLocaleLowerCase().split(', ')
            zhPromptMap.forEach((t, i) => {
              input = input.replace(t, translatedMap[i]).replace('，', ',')
            })
          } catch (err) {
            logger.warn(err)
          }
        }
      }
      
      const [errPath, prompt, uc] = parseInput(input, config, forbidden, options.override)
      if (errPath) return session.text(errPath)

      const seed = options.seed || Math.floor(Math.random() * Math.pow(2, 32))

      const parameters: Dict = {
        seed,
        prompt,
        uc,
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
        })

        options.resolution ||= getImageSize(image.buffer)
        Object.assign(parameters, {
          height: options.resolution.height,
          width: options.resolution.width,
          strength: options.strength ?? 0.3,
        })

      } else {
        options.resolution ||= { height: config.hight, width: config.weigh }
        Object.assign(parameters, {
          height: options.resolution.height,
          width: options.resolution.width,
          scale: options.scale ?? 7,
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

      globalTasks.add(id)
      const cleanUp = () => {
        tasks[session.cid]?.delete(id)
        globalTasks.delete(id)
      }
      const data = (() => {
        const body = {
          init_images: image && [image.dataUrl],
          prompt: parameters.prompt,
          seed: parameters.seed,
          negative_prompt: parameters.uc,
          cfg_scale: parameters.scale,
          width: parameters.width,
          height: parameters.height,
          denoising_strength: parameters.strength,
        }
        return body
      })()
      const request = () => ctx.http.axios('http://127.0.0.1:16002/aa', {
        method: 'POST',
        timeout: config.requestTimeout,
        headers: {
          'api': '42',
          ...config.headers,
        },
        data,
      }).then((res) => {
        return res.data.images
      })

      let ret  //any 是不好的  //会改的
      while (true) {
        try {
          ret = await request()
          cleanUp()
          break
        } catch (err) {
          cleanUp()
          return handleError(session, err)
        }
      }

      async function getContent() {
        const attrs: Dict<any, string> = {
          userId: session.userId,
          nickname: session.author?.nickname || session.username,
        }
        if (config.output === 'minimal')
          return segment('message', attrs, segment.image('base64://' + stripDataPrefix(ret[0])))
        const result = segment('figure')
        const lines = [`种子 = ${seed}`]
        if (config.output === 'verbose') {

          lines.push(`model = Anything 3.0`)
          lines.push(
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
        }

        await Promise.all(
          ret.map(async item => {
            result.children.push(segment('message', attrs, segment.image('base64://' + stripDataPrefix(item))))
            if (config.output === 'verbose') result.children.push(segment('message', attrs, `工作站名称 = 42`))
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
}
