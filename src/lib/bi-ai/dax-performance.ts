import { daxFunctionArguments, maskDax } from './dax-source'

/** Reuse identical scalar CALCULATEs in ROW without moving them across a filter/row context. */
export function reuseRowCalculations(dax: string): string {
  const code = maskDax(dax), evaluated = /\bEVALUATE\s+ROW\s*\(/i.exec(code)
  if (!evaluated) return dax
  const start = evaluated.index, stack: string[] = [], candidates: { start: number; end: number; expression: string }[] = []
  const neutral = new Set(['', 'ROW', 'DIVIDE', 'ROUND', 'ABS'])
  for (const token of code.slice(start).matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(|[()]/g)) {
    const at = start + token.index!, name = token[1]?.toUpperCase() ?? ''
    if (token[0] === ')') { stack.pop(); continue }
    if (name === 'CALCULATE' && stack.length && stack.every(parent => neutral.has(parent))) {
      let depth = 1, end = at + token[0].length
      for (; end < code.length && depth; end++) {
        if (code[end] === '(') depth++
        if (code[end] === ')') depth--
      }
      if (!depth) candidates.push({ start: at, end, expression: dax.slice(at, end) })
    }
    stack.push(name)
  }
  const repeated = [...new Set(candidates.map(candidate => candidate.expression))]
    .filter(expression => candidates.filter(candidate => candidate.expression === expression).length > 1)
  if (!repeated.length) return dax
  let suffix = 0
  const variables = new Map(repeated.map(expression => {
    let name: string
    do { name = `_bi_shared_${suffix++}` } while (new RegExp(`\\b${name}\\b`, 'i').test(code))
    return [expression, name] as const
  }))
  let body = dax.slice(start).replace(/^EVALUATE\s+/i, '')
  const prefixLength = dax.length - body.length
  for (const candidate of candidates.filter(candidate => variables.has(candidate.expression)).reverse()) {
    const at = candidate.start - prefixLength, end = candidate.end - prefixLength
    body = body.slice(0, at) + variables.get(candidate.expression)! + body.slice(end)
  }
  return `${dax.slice(0, start)}EVALUATE\n${[...variables].map(([expression, name]) => `VAR ${name} = ${expression}`).join('\n')}\nRETURN ${body}`
}

/** Split only a scalar ROW result; the complete enclosing context and local variables stay identical. */
export function splitScalarRow(dax: string): string[] | null {
  const code = maskDax(dax), evaluated = /\bEVALUATE\b/i.exec(code)
  if (!evaluated) return null
  const rows = [...code.slice(evaluated.index).matchAll(/\bROW\s*\(/gi)]
  if (rows.length !== 1) return null
  const at = evaluated.index + rows[0].index!, row = daxFunctionArguments(dax.slice(at))
  if (!row || row.name !== 'ROW' || row.args.length < 4 || row.args.length % 2) return null
  const labels = row.args.filter((_, index) => index % 2 === 0)
  if (labels.some(label => !/^"(?:[^"]|"")*"$/.test(label)) || new Set(labels.map(label => label.toLowerCase())).size !== labels.length) return null
  let depth = 1, end = at + rows[0][0].length
  for (; end < code.length && depth; end++) {
    if (code[end] === '(') depth++
    if (code[end] === ')') depth--
  }
  if (depth) return null
  // Filters/iterations over the returned fields cannot be split independently.
  const prefix = code.slice(evaluated.index, at)
  if (/\b(?:FILTER|SELECTCOLUMNS|ADDCOLUMNS|SUMX|AVERAGEX|UNION|GROUPBY|SUMMARIZE)\s*\(/i.test(prefix.replace(/\bVAR\b[\s\S]*\bRETURN\b/i, ''))) return null
  const middle = Math.ceil(labels.length / 2) * 2
  return [row.args.slice(0, middle), row.args.slice(middle)].map(args => `${dax.slice(0, at)}ROW(${args.join(', ')})${dax.slice(end)}`)
}

/** Independently evaluate complete scalar scenario rows, preserving UNION labels and its enclosing context. */
export function splitScenarioRows(dax: string): string[] | null {
  const code = maskDax(dax), evaluated = /\bEVALUATE\b/i.exec(code)
  if (!evaluated) return null
  const unions = [...code.slice(evaluated.index).matchAll(/\bUNION\s*\(/gi)]
  if (unions.length !== 1) return null
  const at = evaluated.index + unions[0].index!, union = daxFunctionArguments(dax.slice(at))
  if (!union || union.args.length < 2) return null
  const rows = union.args.map(daxFunctionArguments)
  if (rows.some(row => !row || row.name !== 'ROW' || row.args.length % 2)) return null
  const labels = rows[0]!.args.filter((_, index) => index % 2 === 0)
  if (rows.some(row => JSON.stringify(row!.args.filter((_, index) => index % 2 === 0)) !== JSON.stringify(labels))) return null
  const body = dax.slice(evaluated.index).replace(/^EVALUATE\s*/i, '')
  const top = daxFunctionArguments(body)
  if (top?.name === 'TOPN' && (top.args.length !== 2 || !/^\d+$/.test(top.args[0]) || Number(top.args[0]) < rows.length)) return null
  const before = code.slice(evaluated.index, at)
  if (!/(?:\bEVALUATE|\bRETURN)\s*$/i.test(before)) return null
  let depth = 1, end = at + unions[0][0].length
  for (; end < code.length && depth; end++) { if (code[end] === '(') depth++; if (code[end] === ')') depth-- }
  if (depth || /ORDER\s+BY|[^)\s]/i.test(code.slice(end))) return null
  return union.args.map(row => `${dax.slice(0, at)}${row}${dax.slice(end)}`)
}

/** Capacity failures retry smaller exact reads, without another LLM plan or partial answers. */
export async function readWithCapacityFallback(dax: string,
  execute: (query: string) => Promise<Record<string, unknown>[]>, onSplit?: () => void): Promise<Record<string, unknown>[]> {
  try { return await execute(dax) }
  catch (error) {
    if (!(error instanceof Error) || !/Resource Governance|memory limit|limite de mem[oó]ria/i.test(error.message)) throw error
    const scenarios = splitScenarioRows(dax), parts = scenarios ?? splitScalarRow(dax)
    if (!parts) throw error
    onSplit?.()
    const rows: Record<string, unknown>[] = []
    // Sequential fallback keeps pressure low on the capacity that rejected the larger read.
    for (const part of parts) {
      const result = await readWithCapacityFallback(part, execute, onSplit)
      if (result.length !== 1) throw new Error('A leitura dividida não retornou uma linha completa.')
      rows.push(result[0])
    }
    return scenarios ? rows : [Object.assign({}, ...rows)]
  }
}
