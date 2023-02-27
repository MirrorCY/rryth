export interface parseOnput {
  errPath?: string
  positive?: string
  uc?: string
}

export interface Size {
  width: number
  height: number
}

export interface Forbidden {
  pattern: string
  strict: boolean
}

export interface Result {
  images: string[]
  messages: string[]
}
