export const SOURCE_SECTION = '### Fonte e filtros'

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_\[\]<>#|~]/g, '\\$&')
}

/** Recover older stored Markdown wrappers and discard empty bullets without altering code. */
export function normalizeChatMarkdown(value: string): string {
  let text = value.replace(/\r\n/g, '\n').trim()
  if (!text.includes('\n') && /^#{1,4}\s/.test(text) && text.includes('\\n')) text = text.replace(/\\n/g, '\n')
  const wrapped = /^```(?:markdown|md)?\s*\n([\s\S]+)\n```$/i.exec(text)
  if (wrapped && /^#{1,4}\s/m.test(wrapped[1])) text = wrapped[1]
  let fence: string | null = null
  return text.split('\n').flatMap(line => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return [line]
    }
    if (fence !== null) return [line]
    if (/^\s{0,3}[-+*]\s*$/.test(line)) return []
    // Keep old histories compatible with the shared renderer; preserve meaningful warnings.
    return [line.replace(/^(#{1,4}\s+)(?:📊|🔎|🧾|🧩|📋)\s+/u, '$1')]
  }).join('\n').trim()
}
