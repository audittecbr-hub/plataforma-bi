import { maskDax } from './dax-source'
import type { BiManifest } from './manifest'

export interface VerifiedResult { purpose: string; rows: Record<string, unknown>[]; truncated: boolean }

export function resultColumns(result: VerifiedResult, index = 0, manifest?: BiManifest) {
  // Separate aliases from native measure names; [Receita] must not silently
  // resolve to a model measure when the intended input is a verified result cell.
  const reserved = new Set([...(manifest?.measures.map(measure => measure.name) ?? []),
    ...(manifest?.tables.flatMap(table => table.columns.map(column => column.name)) ?? [])].map(name => name.toLowerCase()))
  return [...new Set(result.rows.flatMap(row => Object.keys(row)))].map((field, column) => {
    let alias = `_bi_col_${index}_${column}`
    while (reserved.has(alias.toLowerCase())) alias += '_value'
    reserved.add(alias.toLowerCase())
    return { field, alias }
  })
}

export function resultCatalog(results: VerifiedResult[], manifest?: BiManifest) {
  return results.map((result, index) => ({ table: `_bi_result_${index}`, purpose: result.purpose,
    complete: !result.truncated, rowCount: result.rows.length, columns: resultColumns(result, index, manifest) }))
}

/** DAX table variables use [alias], even when the planner qualifies a verified result field. */
export function normalizeResultReferences(dax: string, results: VerifiedResult[] = [], manifest?: BiManifest): string {
  return dax.replace(/"(?:[^"]|"")*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*|--[^\n]*|(?:'(_bi_result_\d+)'|(_bi_result_\d+))\s*\[((?:[^\]]|\]\])+)\]/gi,
    (full, quoted: string | undefined, plain: string | undefined, member: string | undefined) => {
      if (!member) return full
      const name = (quoted ?? plain)!, result = results[Number(name.slice('_bi_result_'.length))]
      if (!result) return full
      const column = resultColumns(result, Number(name.slice('_bi_result_'.length)), manifest)
        .find(column => column.alias.toLowerCase() === member.replaceAll(']]', ']').toLowerCase())
      return column ? `[${column.alias.replaceAll(']', ']]')}]` : full
    })
}

/** Values come exclusively from server-authenticated Power BI reads in this analysis. */
export function materializeVerifiedResults(dax: string, results: VerifiedResult[] = [], manifest?: BiManifest) {
  const code = maskDax(dax)
  const names = [...new Set([...code.matchAll(/\b_bi_result_\d+\b/gi)].map(match => match[0].toLowerCase()))]
  const definitions: string[] = [], aliases: string[] = []
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
  for (const name of names) {
    if (new RegExp(`\\bVAR\\s+${name}\\s*=`, 'i').test(code)) throw new Error('Não redefina os resultados conferidos pelo servidor.')
    const index = Number(name.slice('_bi_result_'.length)), result = results[index]
    if (!result || !result.rows.length || result.truncated) throw new Error('A análise precisa de um resultado completo já consultado. Consulte o recorte no BI primeiro.')
    const columns = resultColumns(result, index, manifest)
    for (const column of columns) {
      const types = new Set(result.rows.map(row => row[column.field]).filter(value => value !== null && value !== undefined).map(value => typeof value))
      if (types.size > 1) throw new Error('O campo possui tipos diferentes. Faça a composição diretamente no modelo.')
    }
    const literal = (value: unknown) => {
      if (value === null || value === undefined) return 'BLANK()'
      if (typeof value === 'boolean') return value ? 'TRUE()' : 'FALSE()'
      if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return String(value)
      if (typeof value === 'string' && !value.includes('\u0000')) return quote(value)
      throw new Error('Valor sem representação DAX exata. Faça a composição diretamente no modelo.')
    }
    const rows = result.rows.map(row => `ROW(${columns.map(column => `${quote(column.alias)}, ${literal(row[column.field])}`).join(', ')})`)
    definitions.push(`VAR ${name} = ${rows.length === 1 ? rows[0] : `UNION(${rows.join(', ')})`}`)
    aliases.push(...columns.map(column => column.alias))
  }
  if (definitions.join('\n').length > 128000) throw new Error('Os resultados são grandes demais para composição. Agregue o recorte necessário no modelo primeiro.')
  return { definitions, aliases, names }
}

/** Persist query structure/provenance, not a second copy of the temporary result rows. */
export function auditResultQuery(dax: string): string {
  const code = maskDax(dax), evaluate = /\bEVALUATE\b/i.exec(code)?.index ?? code.length
  const declarations = [...code.slice(0, evaluate).matchAll(/\bVAR\s+(_bi_result_\d+)\s*=/g)]
  let result = dax
  for (let index = declarations.length - 1; index >= 0; index--) {
    const declaration = declarations[index], end = declarations[index + 1]?.index ?? evaluate
    result = result.slice(0, declaration.index) + `VAR ${declaration[1]} = BLANK()\n-- Resultado temporário das leituras anteriores; valores não persistidos.\n` + result.slice(end)
  }
  return result
}
