import 'server-only'
import { executeDaxQuery, getLatestRefreshStatus, PowerBiQueryError, powerBiUserMessage } from '../powerbi'
import type { BiManifest, BiTable } from './manifest'
import { normalizeTerm, selectContext } from './context'
import { validateDax } from './dax-guard'
import { mapConcurrent } from './concurrency'
import { BiAiError } from './access'
import { biProgress, type BiProgressReporter } from './progress'
import { escapeMarkdown, SOURCE_SECTION } from './message-format'

export interface JobTableResult { table: string; columns: string[]; formats?: Record<string, string | undefined>;
  rows: Record<string, unknown>[]; truncated: boolean; dax: string }

export function jobTables(manifest: BiManifest, allowRestricted = false): { table: BiTable; jobColumn: string }[] {
  return manifest.tables.filter(table => table.queryable).flatMap(table => {
    const columns = table.columns.filter(column => column.queryable && !column.presentationOnly && (!column.restricted || allowRestricted))
    const column = ['job', 'codigo job', 'job codigo', 'cod job', 'job code']
      .map(name => columns.find(column => normalizeTerm(column.name) === name)).find(Boolean)
    return column ? [{ table: { ...table, columns }, jobColumn: column.name }] : []
  })
}

export function jobDetailDax(table: BiTable, jobColumn: string, jobCode: string, maxRows: number): string {
  const name = `'${table.name.replaceAll("'", "''")}'`
  const ref = (column: string) => `${name}[${column.replaceAll(']', ']]')}]`
  const columns = table.columns.filter(column => column.queryable)
  if (!columns.some(column => column.name === jobColumn)) throw new BiAiError(409, 'JOB_COLUMN_MISSING', 'O campo do job não está disponível neste modelo.')
  const order = columns.find(column => /data.*entrada|data.*cadastro|data.*aprov|^data$/i.test(column.name)) ?? columns.find(column => column.name === jobColumn)!
  const selected = `SELECTCOLUMNS(FILTER(${name}, UPPER(TRIM(${ref(jobColumn)})) = "${jobCode.replaceAll('"', '""')}"), ${columns.map(column => `"${column.name.replaceAll('"', '""')}", ${ref(column.name)}`).join(', ')})`
  return `EVALUATE TOPN(${maxRows}, ${selected}, [${order.name.replaceAll(']', ']]')}], ASC) ORDER BY [${order.name.replaceAll(']', ']]')}] ASC`
}

function valueText(value: unknown, format?: string): string {
  if (value === null || value === undefined || value === '') return 'Não informado'
  if (typeof value === 'number') {
    const mask = format?.replaceAll('\\', '').split(';')[0].trim() ?? ''
    const numeric = /^(R\$\s*)?[#0,]+(?:\.([#0]+))?(%)?$/.exec(mask)
    if (numeric) {
      const digits = numeric[2]?.length ?? 0
      const text = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: numeric[2]?.replaceAll('#', '').length ?? 0,
        maximumFractionDigits: digits, ...(numeric[3] ? { style: 'percent' } : {}) }).format(value)
      return numeric[1] ? `R$\u00a0${text}` : text
    }
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 10 }).format(value)
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
    const time = value.slice(11, 19)
    if (/^(?:Long Time|Short Time|hh:mm(?::ss)?)$/i.test(format ?? '')) return /^Short Time$|^hh:mm$/i.test(format!) ? time.slice(0, 5) : time
    return time && time !== '00:00:00' ? `${date} ${time}` : date
  }
  return String(value).replace(/\r?\n/g, ' · ')
}

export function formatJobDetails(jobCode: string, results: JobTableResult[]): string {
  const populated = results.filter(result => result.rows.length).sort((a, b) => Number(/cadastro/i.test(b.table)) - Number(/cadastro/i.test(a.table)))
  if (!populated.length) return [`### 🧩 Job ${escapeMarkdown(jobCode)}`, 'Não encontrei registros desse job no modelo publicado.',
    SOURCE_SECTION, `- **Filtro:** job igual a ${escapeMarkdown(jobCode)}.`,
    `- **Tabelas consultadas:** ${results.map(result => escapeMarkdown(result.table)).join(', ')}.`].join('\n\n')
  const blocks = populated.map(result => {
    const consistent = result.columns.filter(column => result.rows.every(row => Object.is(row[column], result.rows[0][column])))
    const changing = result.columns.filter(column => !consistent.includes(column))
    const empty = consistent.filter(column => result.rows[0][column] === null || result.rows[0][column] === '')
    const fields = consistent.filter(column => !empty.includes(column))
      .map(column => `- **${escapeMarkdown(column)}:** ${escapeMarkdown(valueText(result.rows[0][column], result.formats?.[column]))}`).join('\n')
    const table = changing.length ? [`| ${changing.map(escapeMarkdown).join(' | ')} |`, `| ${changing.map(() => '---').join(' | ')} |`,
      ...result.rows.map(row => `| ${changing.map(column => escapeMarkdown(valueText(row[column], result.formats?.[column]))).join(' | ')} |`)].join('\n') : ''
    const title = result.table.replace(/^vw_powerbi_/i, '').replaceAll('_', ' ')
    return [`### 📂 ${escapeMarkdown(title)}`, `**${result.rows.length} registro(s) encontrado(s).**`, fields, table,
      ...(empty.length ? [`- **Campos sem valor no modelo:** ${empty.map(escapeMarkdown).join(', ')}.`] : []),
      ...(result.truncated ? ['> ⚠️ Esta tabela alcançou o limite de registros. Refine o pedido para consultar o restante.'] : [])].filter(Boolean).join('\n\n')
  })
  return [`### 🧩 Job ${escapeMarkdown(jobCode)}`, `**📋 Registros exibidos:** ${populated.reduce((count, result) => count + result.rows.length, 0)} em ${populated.length} grupos.`,
    '**Período:** todo o histórico disponível no modelo. Abra os grupos abaixo para ver os registros.',
    ...blocks, SOURCE_SECTION, `- **Filtro:** job igual a ${escapeMarkdown(jobCode)}.`, '- **Período:** todo o histórico disponível no modelo.',
    '- Valores de crédito e honorários podem se repetir entre etapas. Não foram somados como se fossem valores independentes.',
    ...results.filter(result => !result.rows.length).map(result => `- ${escapeMarkdown(result.table)}: nenhum registro para este job.`)].join('\n\n')
}

export async function loadJobDetails(input: { manifest: BiManifest; jobCode: string; question: string; signal?: AbortSignal;
  isAdmin?: boolean; onProgress?: BiProgressReporter; onQuery?: (entry: { dax: string; durationMs: number; rowCount: number; status: string; errorCode?: string }) => Promise<void> }) {
  let context = selectContext(input.manifest, input.question, input.isAdmin === true)
  const tables = jobTables(input.manifest, context.allowRestricted)
  if (!tables.length) return null
  const limit = input.manifest.policy.maxRows
  // This server-compiled query needs the complete eligible catalog, not the planner's bounded prompt.
  context = { ...context, tables: tables.map(({ table }) => table), columns: tables.flatMap(({ table }) => table.columns) }
  const refreshBefore = await getLatestRefreshStatus(input.manifest.workspaceId, input.manifest.semanticModelId, input.signal)
  if (refreshBefore && ['Unknown', 'InProgress'].includes(refreshBefore.status)) {
    throw new BiAiError(409, 'MODEL_REFRESH_IN_PROGRESS', 'O modelo está sendo atualizado. Repita a pergunta após a conclusão.')
  }
  input.onProgress?.(biProgress(2, 'Consultando cadastro, etapas e demais registros do job no modelo.'))
  const results = await mapConcurrent(tables, 3, async ({ table, jobColumn }): Promise<JobTableResult> => {
    const dax = jobDetailDax(table, jobColumn, input.jobCode, limit), started = Date.now()
    validateDax(dax, context, input.manifest, limit)
    try {
      const raw = await executeDaxQuery({ workspaceId: input.manifest.workspaceId, semanticModelId: input.manifest.semanticModelId, dax, signal: input.signal })
      const columns = table.columns.filter(column => column.queryable).map(column => column.name)
      const rows = raw.slice(0, limit).map(row => Object.fromEntries(columns.map(column => {
        const key = [`[${column}]`, `${table.name}[${column}]`].find(key => Object.hasOwn(row, key))
        if (!key || row[key] === undefined) throw new BiAiError(502, 'JOB_DATA_INCOMPLETE', 'O Power BI não retornou todos os campos do job. Tente novamente.')
        return [column, row[key]]
      })))
      if (rows.some(row => String(row[jobColumn] ?? '').trim().toUpperCase() !== input.jobCode)) {
        throw new BiAiError(502, 'JOB_FILTER_MISMATCH', 'Não consegui confirmar o filtro do job nos registros retornados.')
      }
      await input.onQuery?.({ dax, durationMs: Date.now() - started, rowCount: rows.length, status: 'success' })
      return { table: table.name, columns, formats: Object.fromEntries(table.columns.map(column => [column.name, column.format])),
        rows, truncated: rows.length >= limit, dax }
    } catch (error) {
      await input.onQuery?.({ dax, durationMs: Date.now() - started, rowCount: 0, status: 'error', errorCode: error instanceof PowerBiQueryError ? error.code : 'UNKNOWN' })
      if (error instanceof PowerBiQueryError) throw new BiAiError(502, error.code, powerBiUserMessage(error))
      throw error
    }
  }, input.signal)
  const refresh = await getLatestRefreshStatus(input.manifest.workspaceId, input.manifest.semanticModelId, input.signal)
  const refreshKey = (entry: typeof refresh) => entry && [entry.requestId, entry.status, entry.startTime, entry.endTime].join('|')
  if (refreshKey(refreshBefore) !== refreshKey(refresh)) {
    throw new BiAiError(409, 'MODEL_REFRESH_CHANGED', 'A atualização do modelo mudou durante a análise. Repita a pergunta para conferir os novos dados.')
  }
  input.onProgress?.(biProgress(3, 'Conferindo os registros e organizando os dados do job.'))
  const body = formatJobDetails(input.jobCode, results)
  const warning = refresh?.status === 'Failed' ? '> ⚠️ A última atualização do modelo falhou. Estes registros pertencem à versão de dados disponível no Power BI.' : ''
  const answer = warning ? body.replace('\n\n', `\n\n${warning}\n\n`) : body
  return { answer, results,
    queries: results.map(result => ({ purpose: `Registros do job ${input.jobCode} em ${result.table}`, dax: result.dax, rowCount: result.rows.length })),
    truncated: results.some(result => result.truncated) }
}
