import type { BiManifest } from './manifest'
import type { SelectedContext } from './context'
import { maskDax, resolveSourceVariables } from './dax-source'
import { validateDax } from './dax-guard'

/** Accept arbitrary read expressions; the server bounds their output without changing filters or ordering. */
export function boundedReadQuery(dax: string, maxRows: number): string {
  const text = dax.trim(), code = maskDax(text)
  if (!/^EVALUATE\s+/i.test(code) || /\bDEFINE\b/.test(code) || [...code.matchAll(/\bEVALUATE\b/gi)].length !== 1) {
    throw new Error('Use uma consulta EVALUATE com expressão de leitura do modelo.')
  }
  if (/^EVALUATE\s+ROW\s*\(/i.test(text)) return text
  const start = /^EVALUATE\s+/i.exec(text)![0].length
  let depth = 0, end = text.length
  for (const token of code.matchAll(/[(){}]|\bORDER\s+BY\b/gi)) {
    if (token[0] === '(' || token[0] === '{') depth++
    else if (token[0] === ')' || token[0] === '}') depth--
    else if (depth === 0) { end = token.index!; break }
  }
  // Already bounded queries retain their requested TOPN and tie behavior.
  const existing = /^EVALUATE\s+TOPN\s*\(\s*(\d+)\s*,/i.exec(text)
  if (existing && Number(existing[1]) <= maxRows) {
    if (end < text.length) return text
    const sort = /,\s*((?:'[^']+'|[A-Za-z_]\w*)?\s*\[[^\]]+\])\s*,\s*(ASC|DESC)\s*\)\s*$/i.exec(text)
    return sort ? `${text} ORDER BY ${sort[1].trim()} ${sort[2]}` : text
  }
  const order = end < text.length ? text.slice(end).replace(/^ORDER\s+BY\s+/i, '').trim() : ''
  const topOrder = order ? `, ${order.replace(/\s+(ASC|DESC)(?=\s*(?:,|$))/gi, ', $1')}` : ''
  return `EVALUATE TOPN(${maxRows}, (${text.slice(start, end).trim()})${topOrder})${order ? ` ORDER BY ${order}` : ''}`
}

/** Source variables are copied from the verified live model, with only their required dependencies. */
export function prepareSemanticQuery(input: { dax: string; sourceMeasure?: string; maxRows: number; context: SelectedContext; manifest: BiManifest }) {
  const dax = boundedReadQuery(input.dax, input.maxRows)
  const requestedSource = input.sourceMeasure?.replace(/^.*\[|\]$/g, '').replace(/^'|'$/g, '').trim()
  const source = requestedSource && input.context.semanticSources?.find(source => source.measure.toLowerCase() === requestedSource.toLowerCase())
  const variables = source ? resolveSourceVariables(source, dax) : []
  if (variables.some(variable => !variable.expression)) throw new Error('Inspecione esta medida: faltam expressões de suas regras publicadas.')
  const tables = input.manifest.tables.filter(table => table.queryable)
  const validationContext = { ...input.context, tables,
    columns: tables.flatMap(table => table.columns).filter(column => column.queryable && !column.presentationOnly
      && (!column.restricted || input.context.allowRestricted)),
    measures: input.manifest.measures.filter(measure => measure.queryable && !measure.presentationOnly
      && (!measure.restricted || input.context.allowRestricted)),
  }
  validateDax(dax, validationContext, input.manifest, input.maxRows, {
    variables: variables.map(variable => variable.name), aliases: variables.flatMap(variable => variable.aliases),
  })
  const prefix = variables.length ? `DEFINE\n${variables.map(variable => `VAR ${variable.name} = ${variable.expression}`).join('\n')}\n` : ''
  return { dax: prefix + dax, body: dax, sourceMeasure: source && variables.length ? source.measure : undefined, variables }
}
