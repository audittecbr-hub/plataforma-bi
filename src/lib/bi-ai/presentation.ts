import { formatReportValue, type ReportFact } from './report-evidence'

import { SOURCE_SECTION, escapeMarkdown } from './message-format'
export { SOURCE_SECTION, escapeMarkdown } from './message-format'

export function formatVerifiedAnswer(input: { facts: ReportFact[]; insights: string[]; pages: string[]; notes: string[]; refreshFailed: boolean }): string {
  const lines = input.facts.map(fact => `- **${escapeMarkdown(fact.label)}:** ${formatReportValue(fact)}`)
  const scopes = [...new Set(input.facts.map(fact => fact.scope))]
  return ['### 📊 Valores conferidos', lines.join('\n'),
    ...(input.insights.length ? ['### 🔎 Comparações', input.insights.map(insight => `- ${escapeMarkdown(insight)}`).join('\n')] : []),
    ...(input.refreshFailed ? ['> ⚠️ A última atualização falhou. Estes são os dados que permanecem publicados no BI.'] : []),
    SOURCE_SECTION, `**Origem:** ${input.pages.map(escapeMarkdown).join(', ')} · Power BI`,
    '**Recortes conferidos:**', scopes.map(scope => `- ${escapeMarkdown(scope)}`).join('\n'),
    ...(input.notes.length ? ['**Cuidados com a leitura:**', [...new Set(input.notes)].map(note => `- ${escapeMarkdown(note)}`).join('\n')] : []),
  ].join('\n\n')
}
