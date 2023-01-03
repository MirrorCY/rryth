export interface ImageData {
  buffer: ArrayBuffer
  base64: string
  dataUrl: string
}

export interface parseOnput {
  errPath?: string
  positive?: Array<string>
  uc?: string
}

// TODO: 接口返回格式