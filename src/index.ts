import { Context, Dict, h, Logger } from 'koishi'
import { Config, parseForbidden, parseInput } from './config'
import { Result, Size, Forbidden } from './types'
import { } from '@koishijs/translator'
import { } from '@koishijs/plugin-help'

export * from './config'
export const reactive = true
export const name = 'rryth'
const logger = new Logger(name)

export function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh', require('./locales/zh'))

  let forbidden: Forbidden[]

  ctx.accept(['forbidden'], (config) => {
    forbidden = parseForbidden(config.forbidden)
  }, { immediate: true })

  const resolution = (source: string): Size => {
    const cap = source.match(/^(\d*\.?\d+)[x×](\d*\.?\d+)$/)
    if (!cap) throw new Error()
    const width = +cap[1]
    const height = +cap[2]
    return { width, height }
  }

  const cmd = ctx.command(`${name} <prompts:text>`)
    .alias('sai', 'rr')
    .userFields(['authority'])
    .option('resolution', '-r <resolution>', { type: resolution })
    .option('override', '-O')
    .option('seed', '-x <seed:number>')
    .option('scale', '-c <scale:number>')
    .option('steps', '-t <steps:number>')
    .option('strength', '-N <strength:number>')
    .option('undesired', '-u <undesired>')
    .action(async ({ session, options }, input) => {

      // 空输入时调用帮助
      if (!input?.trim()) return session.execute(`help ${name}`)
      //

      // 分离图片
      let imgUrl: string
      input = h.transform(input, {
        image(attrs) {
          imgUrl = attrs.url
          return ''
        },
      })
      //

      // 解析输入
      const parseOnput = parseInput(input, config, forbidden, options.override)
      let prompt = parseOnput.positive
      if (parseOnput.errPath) return session.text(parseOnput.errPath)
      //

      // 翻译中文
      if (config.translator && ctx.translator) {
        const zhPromptMap: string[] = prompt.match(/[\u4e00-\u9fa5]+/g)
        if (zhPromptMap?.length > 0) {
          try {
            const translatedMap = (
              await ctx.translator.translate({ input: zhPromptMap.join(','), target: 'en' })
            ).toLocaleLowerCase().split(',')
            zhPromptMap.forEach((t, i) => {
              prompt = prompt.replace(t, translatedMap[i]).replace('，', ',')
            })
          } catch (err) {
            logger.warn(err)
          }
        }
      }
      //

      // 构建请求参数
      options.resolution ||= { height: config.hight, width: config.weigh }
      const parameters: Dict = {
        seed: options.seed || Math.floor(Math.random() * Math.pow(2, 32)),
        prompt: prompt,
        negative_prompt: parseOnput.uc,
        cfg_scale: options.scale ?? config.scale,
        steps: options.steps ?? 28,
        height: options.resolution.height,
        width: options.resolution.width,
        denoising_strength: options.strength ?? config.strength,
      }
      if (imgUrl) {
        parameters.init_images = Buffer.from((await ctx.http.file(imgUrl)).data).toString('base64')
      }
      // 

      // 发送请求
      const request = await ctx.http.axios('https://rryth.elchapo.cn:11000/v2', {
        method: 'POST',
        timeout: config.requestTimeout,
        headers: {
          'EULA': 'This interface is intended ONLY for use with the Koishi-plugin-rryth.' +
            'The maintainer refuses any use other than the above methods.'
        },
        data: JSON.stringify(parameters),
      })
      const ret: Result = request.data
      // 

      // 构建消息
      async function getContent() {
        const safeImg = config.censor
          ? h('censor', h('image', { url: ret.images[0] }))
          : h('image', { url: 'data:image/png;base64,' + ret.images[0] })
        const attrs: Dict<any, string> = {
          userId: session.userId,
          nickname: session.author?.nickname || session.username,
        }
        if (config.output === 'minimal') {
          return safeImg
        }
        const result = h('figure')
        const lines = [`种子 = ${parameters.seed}`]
        if (config.output === 'verbose') {
          lines.push(`模型 = Anything 3.0`)
          lines.push(`提示词相关度 = ${parameters.scale}`)
          if (parameters.image) lines.push(`图转图强度 = ${parameters.strength}`)
        }
        result.children.push(h('message', attrs, lines.join('\n')))
        result.children.push(h('message', attrs, `关键词 = ${parameters.prompt}`))
        if (config.output === 'verbose') {
          result.children.push(h('message', attrs, `排除关键词 = ${parameters.negative_prompt}`))
        }
        result.children.push(safeImg)
        if (config.output === 'verbose') result.children.push(h('message', attrs, `工作站名称 = 42`))
        return result
      }
      //

      // 超时撤回
      const ids = await session.send(await getContent())
      if (config.recallTimeout) {
        ctx.setTimeout(() => {
          for (const id of ids) {
            session.bot.deleteMessage(session.channelId, id)
          }
        }, config.recallTimeout)
      }
      // 
    })
}
