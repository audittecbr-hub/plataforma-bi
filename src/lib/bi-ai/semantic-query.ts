import type { BiManifest } from './manifest'
import type { SelectedContext } from './context'
import { daxFunctionArguments, maskDax, resolveSourceVariables, reconcileVariableSource } from './dax-source'
import { validateDax } from './dax-guard'
import { materializeVerifiedResults, normalizeResultReferences, type VerifiedResult } from './result-query'

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
    const sort = /,\s*((?:'[^']+'|[A-Za-z_]\w*)?\s*\[[^\]]+\])\s*(?:,\s*(ASC|DESC|0|1))?\s*\)\s*$/i.exec(text)
    return sort ? `${text} ORDER BY ${sort[1].trim()} ${topnDirection(sort[2])}` : text
  }
  const order = end < text.length ? text.slice(end).replace(/^ORDER\s+BY\s+/i, '').trim()
    : projectedRankingOrder(text.slice(start, end).trim())
  // ORDER BY defaults to ASC for each field. TOPN needs an explicit direction
  // between fields; copying "Year, Month" makes Month become its ORDER argument.
  const terms = order ? daxFunctionArguments(`ORDER(${order})`)?.args : []
  if (order && !terms?.length) throw new Error('Ordenação DAX inválida.')
  const topOrder = terms?.length ? `, ${terms.map(term => {
    const direction = /\s+(ASC|DESC)\s*$/i.exec(term)
    return `${direction ? term.slice(0, direction.index).trim() : term}, ${direction?.[1] ?? 'ASC'}`
  }).join(', ')}` : ''
  return `EVALUATE TOPN(${maxRows}, (${text.slice(start, end).trim()})${topOrder})${order ? ` ORDER BY ${order}` : ''}`
}

/** TOPN's order argument: DESC (or 0) is its default; ASC or 1 sorts upward. */
function topnDirection(value: string | undefined): 'ASC' | 'DESC' {
  return value && /^(?:ASC|1)$/i.test(value.trim()) ? 'ASC' : 'DESC'
}

/**
 * TOPN chooses the rows but not their order. A ranking renamed by SELECTCOLUMNS (as the planner is
 * told to do) lost it: "top 5 jobs" came back in engine order. Keep the TOPN order on its projected column.
 */
function projectedRankingOrder(expression: string): string {
  const outer = daxFunctionArguments(expression)
  if (outer?.name !== 'SELECTCOLUMNS' || outer.args.length < 3) return ''
  const top = daxFunctionArguments(outer.args[0])
  if (top?.name !== 'TOPN' || top.args.length < 3) return ''
  const by = top.args[2].replace(/\s+/g, ' ').trim()
  for (let index = 1; index + 1 < outer.args.length; index += 2) {
    const alias = /^"((?:[^"]|"")+)"$/.exec(outer.args[index].trim())?.[1]
    if (alias && outer.args[index + 1].replace(/\s+/g, ' ').trim() === by) {
      return `[${alias.replaceAll('""', '"').replaceAll(']', ']]')}] ${topnDirection(top.args[3])}`
    }
  }
  return ''
}

/** DEFINE VAR is ordinary read syntax; canonicalize it without allowing measure/table/column overrides. */
export function localizeReadVariables(dax: string): string {
  const text = dax.trim(), code = maskDax(text)
  if (!/^DEFINE\s+VAR\b/i.test(code)) return text
  const evaluations = [...code.matchAll(/\bEVALUATE\b/gi)]
  if (evaluations.length !== 1) return text
  const at = evaluations[0].index!, declarations = text.slice(/^DEFINE\s+/i.exec(code)![0].length, at).trim()
  if (/\b(?:DEFINE|MEASURE|TABLE|COLUMN|EVALUATE)\b/i.test(maskDax(declarations))) return text
  const body = text.slice(at + evaluations[0][0].length).trim()
  return `EVALUATE\n${declarations}\n${/^VAR\b/i.test(maskDax(body)) ? '' : 'RETURN '}${body}`
}

/** Source variables are copied from the verified live model, with only their required dependencies. */
export function prepareSemanticQuery(input: { dax: string; sourceMeasure?: string; maxRows: number; context: SelectedContext; manifest: BiManifest; results?: VerifiedResult[] }) {
  const dax = boundedReadQuery(normalizeResultReferences(localizeReadVariables(input.dax), input.results, input.manifest), input.maxRows)
  const requestedSource = input.sourceMeasure?.replace(/^.*\[|\]$/g, '').replace(/^'|'$/g, '').trim()
  let source = requestedSource && input.context.semanticSources?.find(source => source.measure.toLowerCase() === requestedSource.toLowerCase())
  const code = maskDax(dax), local = new Set([...code.matchAll(/\bVAR\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gi)].map(match => match[1].toLowerCase()))
  const possible = new Set((input.context.semanticSources ?? []).flatMap(source => source.variables.map(variable => variable.name.toLowerCase())))
  const names = [...new Set([...code.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)].map(match => match[0])
    .filter(name => possible.has(name.toLowerCase()) && !local.has(name.toLowerCase())))]
  if (source) source = reconcileVariableSource(input.context.semanticSources ?? [], source, names)
  else if (!requestedSource && names.length) {
    const candidates = (input.context.semanticSources ?? []).filter(source => names.every(name => source.variables.some(variable => variable.name.toLowerCase() === name.toLowerCase())))
    if (candidates.length === 1) source = candidates[0]
  }
  const variables = source ? resolveSourceVariables(source, dax) : []
  const verified = materializeVerifiedResults(dax, input.results, input.manifest)
  if (variables.some(variable => !variable.expression)) throw new Error('Inspecione esta medida: faltam expressões de suas regras publicadas.')
  const tables = input.manifest.tables.filter(table => table.queryable)
  const validationContext = { ...input.context, tables,
    columns: tables.flatMap(table => table.columns).filter(column => column.queryable && !column.presentationOnly
      && (!column.restricted || input.context.allowRestricted)),
    measures: input.manifest.measures.filter(measure => measure.queryable && !measure.presentationOnly
      && (!measure.restricted || input.context.allowRestricted)),
  }
  validateDax(dax, validationContext, input.manifest, input.maxRows, {
    variables: [...variables.map(variable => variable.name), ...verified.names], aliases: [...variables.flatMap(variable => variable.aliases), ...verified.aliases],
  })
  const definitions = [...variables.map(variable => `VAR ${variable.name} = ${variable.expression}`), ...verified.definitions]
  const prefix = definitions.length ? `DEFINE\n${definitions.join('\n')}\n` : ''
  return { dax: prefix + dax, body: dax, sourceMeasure: source && variables.length ? source.measure : undefined, variables, resultNames: verified.names }
}
