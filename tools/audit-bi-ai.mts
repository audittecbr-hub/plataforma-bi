import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createAdminClient } from '../src/utils/supabase/admin'
import { withAiRequestCache } from '../src/lib/ai-request-cache'
import { lerConfigIa } from '../src/lib/llm-config'
import { manifestForDashboard } from '../src/lib/bi-ai/registry'
import { answerBiQuestion } from '../src/lib/bi-ai/pipeline'
import { mapConcurrent } from '../src/lib/bi-ai/concurrency'
import type { DashboardRow } from '../src/lib/bi-ai/access'

interface AuditCase {
  id: string
  dashboardId: string
  question: string
  expected: { kind: 'clarification' } | { kind: 'evidence'; months: string[]; region: string | null;
    values: { label: string; value: number | null; tolerance?: number }[] }
}

/** Golden values must be independently obtained from the published BI, never from this answer pipeline. */
async function main() {
  const fixturePath = process.argv[2], outputPath = process.argv[3]
  if (!fixturePath || !outputPath) throw new Error('Uso: node --conditions=react-server --env-file=.env.local --import tsx tools/audit-bi-ai.mts casos.json resultado.json [--allow-paused]')
  const cases = JSON.parse(await readFile(resolve(fixturePath), 'utf8')) as AuditCase[]
  if (!Array.isArray(cases) || !cases.length || cases.some(item => !item.id || !item.dashboardId || !item.question || !item.expected)) {
    throw new Error('Informe uma lista de perguntas com valores de referência independentes do BI.')
  }
  const configuration = await lerConfigIa()
  if (!configuration.enabled && !process.argv.includes('--allow-paused')) throw new Error('IA pausada. Para uma auditoria isolada, informe --allow-paused; a configuração de produção não será alterada.')
  const admin = createAdminClient()
  const dashboards = new Map<string, DashboardRow>()
  for (const id of new Set(cases.map(item => item.dashboardId))) {
    const { data, error } = await admin.from('dashboards').select('*').eq('id', id).single()
    if (error || !data) throw new Error(`Dashboard indisponível: ${id}`)
    dashboards.set(id, data as DashboardRow)
  }
  const results = await mapConcurrent(cases, 3, async item => {
    const started = Date.now(), dashboard = dashboards.get(item.dashboardId)!
    let modelTokens = 0
    try {
      const result = await withAiRequestCache(async () => answerBiQuestion({
        dashboard, manifest: await manifestForDashboard(dashboard), userId: randomUUID(), conversationId: null,
        isAdmin: false, message: item.question, signal: AbortSignal.timeout(270_000),
        audit: { configuration: { ...configuration, enabled: true },
          takeRateLimit: async () => {}, resolveConversation: async (_, __, id) => id ?? randomUUID(), previousTurns: async () => [],
          recordTurn: async turn => { modelTokens += turn.tokens }, recordQueryLog: async () => {} },
      }))
      const expected = item.expected
      const evidence = 'evidence' in result ? result.evidence : undefined
      const passed = expected.kind === 'clarification'
        ? !('evidence' in result) && ('clarification' in result || result.queries.length === 0)
        : !!evidence && expected.values.length > 0 && JSON.stringify(evidence.scope.months) === JSON.stringify(expected.months)
          && evidence.scope.region === expected.region && expected.values.every(value => {
            const fact = evidence.values.find(fact => fact.label === value.label)
            return !!fact && (value.value === null ? fact.value === null : fact.value !== null
              && Math.abs(fact.value - value.value) <= (value.tolerance ?? fact.precision) + 1e-7)
          })
      console.log(JSON.stringify({ id: item.id, passed, durationMs: Date.now() - started }))
      return { ...item, passed, result, durationMs: Date.now() - started, modelTokens }
    } catch (error) {
      return { ...item, passed: false, error: error instanceof Error ? error.message : 'Falha na auditoria', durationMs: Date.now() - started, modelTokens }
    }
  })
  await writeFile(resolve(outputPath), JSON.stringify({ timestamp: new Date().toISOString(), model: configuration.modelo,
    reasoning: configuration.reasoningEffort, total: results.length, passed: results.filter(item => item.passed).length, results }, null, 2))
  if (results.some(item => !item.passed)) process.exitCode = 1
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na auditoria'); process.exitCode = 1 })
