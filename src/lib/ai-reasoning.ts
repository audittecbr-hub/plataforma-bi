export type ReasoningEffort = 'auto' | 'none' | 'low' | 'medium' | 'high' | 'max'

const ALL: ReasoningEffort[] = ['auto', 'none', 'low', 'medium', 'high', 'max']

/** The UI only offers levels the current HTTP adapter knows how to send. */
export function reasoningOptions(providerId: string, model: string): ReasoningEffort[] {
  if (providerId === 'deepseek') return ALL
  if (providerId === 'openai') {
    if (/^gpt-5-pro(?:\b|[.-])/i.test(model)) return ['auto', 'high']
    if (/^gpt-5\.(?:[1-9]|\d{2})(?:\b|[.-])/i.test(model)) return ['auto', 'none', 'low', 'medium', 'high']
    return /^(?:o\d|gpt-[5-9])(?:\b|[.-])/i.test(model)
      ? ['auto', 'low', 'medium', 'high'] : ['auto']
  }
  if (providerId === 'anthropic') {
    const match = /^claude-(?:sonnet|opus|fable|mythos)-(\d+)(?:-(\d+))?/i.exec(model)
    const major = match ? Number(match[1]) : 0
    const minor = match?.[2] ? Number(match[2]) : 0
    return major >= 5 || (major === 4 && minor >= 6)
      ? ['auto', 'low', 'medium', 'high', 'max'] : ['auto']
  }
  if (providerId === 'compatible') return ['auto', 'none', 'low', 'medium', 'high']
  return ['auto']
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && ALL.includes(value as ReasoningEffort)
}

export type ModelProtocol = 'chat/completions' | 'messages' | 'responses'

/** OpenCode Go exposes model families on different HTTP protocols. */
export function modelProtocol(providerId: string, model: string): ModelProtocol | null {
  if (providerId === 'anthropic') return 'messages'
  if (providerId !== 'opencode-go') return 'chat/completions'
  if (/^(?:grok-|gpt-|muse-)/i.test(model)) return 'responses'
  if (/^(?:minimax-|qwen)/i.test(model)) return 'messages'
  if (/^(?:glm-|kimi-|longcat-|deepseek-|mimo-|hy\d|space-bunny-)/i.test(model)) return 'chat/completions'
  return null
}

export function modelSupportedByAdapter(providerId: string, model: string): boolean {
  return modelProtocol(providerId, model) !== null
}
