import { Context, Dict, pick, Quester } from 'koishi'
import {
  crypto_generichash, crypto_pwhash,
  crypto_pwhash_ALG_ARGON2ID13, crypto_pwhash_SALTBYTES, ready,
} from 'libsodium-wrappers'
import imageSize from 'image-size'
import { ImageData } from './types'

export function project(object: {}, mapping: {}) {
  const result = {}
  for (const key in mapping) {
    result[key] = object[mapping[key]]
  }
  return result
}

export interface Size {
  width: number
  height: number
}

export function getImageSize(buffer: ArrayBuffer): Size {
  if (process.env.KOISHI_ENV === 'browser') {
    const blob = new Blob([buffer])
    const image = new Image()
    image.src = URL.createObjectURL(blob)
    return pick(image, ['width', 'height'])
  } else {
    return imageSize(Buffer.from(buffer))
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  if (process.env.KOISHI_ENV === 'browser') {
    let result = ''
    const chunk = 8192
    for (let index = 0; index < buffer.byteLength; index += chunk) {
      result += String.fromCharCode.apply(null, buffer.slice(index, index + chunk))
    }
    return btoa(result)
  } else {
    return Buffer.from(buffer).toString('base64')
  }
}

const MAX_OUTPUT_SIZE = 1048576
const MAX_CONTENT_SIZE = 10485760
const ALLOWED_TYPES = ['image/jpeg', 'image/png']

export async function download(ctx: Context, url: string, headers = {}): Promise<ImageData> {
  if (url.startsWith('data:')) {
    const [, type, base64] = url.match(/^data:(image\/\w+);base64,(.*)$/)
    if (!ALLOWED_TYPES.includes(type)) {
      throw new NetworkError('.unsupported-file-type')
    }
    const binary = atob(base64)
    const result = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      result[i] = binary.charCodeAt(i)
    }
    return { buffer: result, base64, dataUrl: url }
  } else {
    const head = await ctx.http.head(url, { headers })
    if (+head['content-length'] > MAX_CONTENT_SIZE) {
      throw new NetworkError('.file-too-large')
    }
    const mimetype = head['content-type']
    if (!ALLOWED_TYPES.includes(mimetype)) {
      throw new NetworkError('.unsupported-file-type')
    }
    const buffer = await ctx.http.get(url, { responseType: 'arraybuffer', headers })
    const base64 = arrayBufferToBase64(buffer)
    return { buffer, base64, dataUrl: `data:${mimetype};base64,${base64}` }
  }
}

export async function calcAccessKey(email: string, password: string) {
  await ready
  return crypto_pwhash(
    64,
    new Uint8Array(Buffer.from(password)),
    crypto_generichash(
      crypto_pwhash_SALTBYTES,
      password.slice(0, 6) + email + 'novelai_data_access_key',
    ),
    2,
    2e6,
    crypto_pwhash_ALG_ARGON2ID13,
    'base64').slice(0, 64)
}

export async function calcEncryptionKey(email: string, password: string) {
  await ready
  return crypto_pwhash(
    128,
    new Uint8Array(Buffer.from(password)),
    crypto_generichash(
      crypto_pwhash_SALTBYTES,
      password.slice(0, 6) + email + 'novelai_data_encryption_key'),
    2,
    2e6,
    crypto_pwhash_ALG_ARGON2ID13,
    'base64')
}

export class NetworkError extends Error {
  constructor(message: string, public params = {}) {
    super(message)
  }

  static catch = (mapping: Dict<string>) => (e: any) => {
    if (Quester.isAxiosError(e)) {
      const code = e.response?.status
      for (const key in mapping) {
        if (code === +key) {
          throw new NetworkError(mapping[key])
        }
      }
    }
    throw e
  }
}

export interface Size {
  width: number
  height: number
}

export function stripDataPrefix(base64: string) {
  // workaround for different gradio versions
  // https://github.com/koishijs/novelai-bot/issues/90
  return base64.replace(/^data:image\/[\w-]+;base64,/, '')
}

