export const SOURCE_SECTION = '### 🧾 Fonte e filtros'

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_\[\]<>#|~]/g, '\\$&')
}
