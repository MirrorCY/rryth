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

  let forbiddenList: Forbidden[]

  ctx.accept(['forbidden'], (config) => {
    forbiddenList = parseForbidden(config.forbidden)
  }, { immediate: true })

  const resolution = (source: string): Size => {
    const cap = source.match(/^(\d*\.?\d+)[x×](\d*\.?\d+)$/)
    if (!cap) throw new Error()
    const width = +cap[1]
    const height = +cap[2]
    return { width, height }
  }

  const command = ctx.command(`${name} <prompts:text>`)
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
      if (!input?.trim()) return session.execute(`help ${name}`)
      let imgUrl: string
      input = h.transform(input, {
        image(attrs) {
          imgUrl = attrs.url
          return ''
        },
      })
      const parsedInput = parseInput(input, config, forbiddenList, options.override)
      let prompt = parsedInput.positive
      if (parsedInput.errPath) return session.text(parsedInput.errPath)
      if (config.translator && ctx.translator) {
        const zhPromptList: string[] = prompt.match(/[\u4e00-\u9fa5]+/g)
        if (zhPromptList?.length > 0) {
          try {
            const translatedList = (
              await ctx.translator.translate({ input: zhPromptList.join(','), target: 'en' })
            ).toLocaleLowerCase().split(',')
            zhPromptList.forEach((t, i) => {
              prompt = prompt.replace(t, translatedList[i]).replace('，', ',')
            })
          } catch (err) {
            logger.warn(err)
          }
        }
      }
      const parameters: Dict = {
        seed: options.seed || Math.floor(Math.random() * Math.pow(2, 32)),
        prompt: prompt,
        negative_prompt: parsedInput.uc,
        cfg_scale: options.scale ?? config.scale,
        steps: options.steps ?? 28,
        denoising_strength: options.strength ?? config.strength,
      }
      if (imgUrl) {
        parameters.init_images = Buffer.from((await ctx.http.file(imgUrl)).data).toString('base64')
      }
      else {
        // 如果有图片则无需指定分辨率
        options.resolution ||= { height: config.height, width: config.width }
        parameters.width = options.resolution.width
        parameters.height = options.resolution.height
      }
      const requestOptions = {
        method: 'POST',
        timeout: config.requestTimeout,
        headers: {
          'EULA': 'This interface is intended ONLY for use with the Koishi-plugin-rryth.' +
            'The maintainer refuses any use other than the above methods.'
        },
        data: JSON.stringify(parameters),
      }
      const request = await ctx.http.axios('https://rryth.elchapo.cn:11000/v2', requestOptions)
      const result: Result = request.data

      async function getContent() {
        const safeImg = config.censor
          ? h('censor', h('image', { url: result.images[0] }))
          : h('image', { url: result.images[0] })
        const attrs: Dict<any, string> = {
          userId: session.userId,
          nickname: session.author?.nickname || session.username,
        }
        if (config.output === 'minimal') {
          return safeImg
        }
        const output = h('figure')
        const lines = [`种子 = ${parameters.seed}`]
        if (config.output === 'verbose') {
          lines.push(`模型 = Anything 3.0`)
          lines.push(`提示词相关度 = ${parameters.cfg_scale}`)
          if (parameters.image) lines.push(`图转图强度 = ${parameters.denoising_strength}`)
        }
        output.children.push(h('message', attrs, lines.join('\n')))
        output.children.push(h('message', attrs, `关键词 = ${parameters.prompt}`))
        if (config.output === 'verbose') {
          output.children.push(h('message', attrs, `排除关键词 = ${parameters.negative_prompt}`))
        }
        output.children.push(safeImg)
        if (config.output === 'verbose') output.children.push(h('message', attrs, `工作站名称 = 42`))
        return output
      }

      const messageIds = await session.send(await getContent())
      if (config.recallTimeout) {
        ctx.setTimeout(() => {
          for (const messageId of messageIds) {
            session.bot.deleteMessage(session.channelId, messageId)
          }
        }, config.recallTimeout)
      }
    })
}
