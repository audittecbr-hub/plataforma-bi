import { formatReportValue, type ReportFact } from './report-evidence'

import { SOURCE_SECTION, escapeMarkdown } from './message-format'
import type { PlannedQuery } from './plan'
export { SOURCE_SECTION, escapeMarkdown } from './message-format'

/** Context is prepared with the query, so a readable introduction adds no model round trip. */
export function answerContext(explanation: string | undefined, fallback: string): string {
  const text = explanation?.replace(/\s+/g, ' ').trim()
  // Numeric facts are rendered from Power BI rows; the introduction explains the reading only.
  return text && !/R\$\s*[-+]?\s*\d|\d[\d.,]*\s*%|\d[.,]\d|\b\d{5,}\b|^#{1,6}\s|[\p{Extended_Pictographic}]/u.test(text)
    ? escapeMarkdown(text) : fallback
}

/**
 * Sort keys (AnoMesOrdenacao, Ordem) only order the rows. Shown, they read as numbers ("202.607"):
 * hide them when another text column already names each row.
 */
export function visibleColumns(rows: Record<string, unknown>[]): string[] {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const name = (key: string) => key.includes('[') ? key.slice(key.indexOf('[') + 1).replace(/\]$/, '') : key
  const sortKey = (key: string) => /ordena[cç][aã]o|(?:^|[\s_])ordem$/i.test(name(key))
  const named = keys.some(key => !sortKey(key) && rows.some(row => typeof row[key] === 'string'))
  return named ? keys.filter(key => !sortKey(key)) : keys
}

export function resultValue(value: unknown, format?: NonNullable<PlannedQuery['formats']>[string]): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? 'Não informado')
  const decimals = format?.decimals ?? 2
  const options: Intl.NumberFormatOptions = { maximumFractionDigits: decimals }
  if (format?.type === 'currency') Object.assign(options, { style: 'currency', currency: 'BRL', minimumFractionDigits: decimals })
  if (format?.type === 'percent') Object.assign(options, { style: 'percent', minimumFractionDigits: decimals })
  return new Intl.NumberFormat('pt-BR', options).format(format?.type === 'percent' && format.percentScale === 'points' ? value / 100 : value)
}

export function formatVerifiedAnswer(input: { facts: ReportFact[]; insights: string[]; pages: string[]; notes: string[]; refreshFailed: boolean }): string {
  const lines = input.facts.map(fact => `- **${escapeMarkdown(fact.label)}:** ${formatReportValue(fact)}`)
  const scopes = [...new Set(input.facts.map(fact => fact.scope))]
  const indicators = [...new Set(input.facts.map(fact => fact.label))]
  const subject = indicators.length <= 3 ? indicators.map(escapeMarkdown).join(', ') : 'os indicadores solicitados'
  const context = `Consultei ${subject} no Power BI, considerando ${scopes.map(escapeMarkdown).join('; ')}. Os valores abaixo seguem as fórmulas e a precisão exibidas no relatório para esse recorte.`
  return [context, '### Valores conferidos', lines.join('\n'),
    ...(input.insights.length ? ['### Comparações', input.insights.map(insight => `- ${escapeMarkdown(insight)}`).join('\n')] : []),
    ...(input.refreshFailed ? ['> ⚠️ A última atualização falhou. Estes são os dados que permanecem publicados no BI.'] : []),
    SOURCE_SECTION, `**Origem:** ${input.pages.map(escapeMarkdown).join(', ')} · Power BI`,
    '**Recortes conferidos:**', scopes.map(scope => `- ${escapeMarkdown(scope)}`).join('\n'),
    ...(input.notes.length ? ['**Cuidados com a leitura:**', [...new Set(input.notes)].map(note => `- ${escapeMarkdown(note)}`).join('\n')] : []),
  ].join('\n\n')
}
