/** DeepSeek V4.1 Flash output ceiling documented and confirmed by the provider. */
export const DEEPSEEK_MAX_OUTPUT_TOKENS = 393_216

/** Prefer the live model catalog so newly published limits take effect automatically. */
export function maximumOutputTokens(providerId: string, model: string, metadata?: unknown): number | undefined {
  if (metadata && typeof metadata === 'object') {
    const value = (metadata as Record<string, unknown>).max_output_tokens
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  }
  if ((providerId === 'deepseek' || providerId === 'opencode-go')
    && /^deepseek-(?:flash|v4(?:\.1)?-(?:flash(?:-vision-exp)?|pro))$/i.test(model)) {
    return DEEPSEEK_MAX_OUTPUT_TOKENS
  }
  // Other Chat/Responses APIs can select their native allowance when omitted.
  return undefined
}
