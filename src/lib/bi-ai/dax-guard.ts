import type { BiManifest, BiObject } from './manifest'
import type { SelectedContext } from './context'

export class DaxGuardError extends Error {}

const DAX_WORDS = new Set(`EVALUATE ROW TOPN SUMMARIZECOLUMNS CALCULATE FILTER
  DATEADD SAMEPERIODLASTYEAR PREVIOUSMONTH PREVIOUSYEAR DATESYTD DATESMTD
  DATESBETWEEN DATESINPERIOD STARTOFMONTH ENDOFMONTH VALUES SELECTEDVALUE
  ALL ALLSELECTED ALLNOBLANKROW KEEPFILTERS REMOVEFILTERS DIVIDE IF
  BLANK COALESCE TRUE FALSE NOT AND OR IN SUM AVERAGE MIN MAX DISTINCTCOUNT
  COUNT COUNTROWS SUMX AVERAGEX MINX MAXX DISTINCT CONCATENATEX YEAR MONTH
  TODAY NOW EOMONTH USERELATIONSHIP ISBLANK ABS ROUND SWITCH SELECTCOLUMNS
  ADDCOLUMNS UNION EXCEPT INTERSECT VAR RETURN DATE ASC DESC`.split(/\s+/).filter(Boolean))

function findByName(items: BiObject[], name: string): BiObject | undefined {
  return items.find((item) => item.name.toLowerCase() === name.toLowerCase())
}

/** A deliberately small DAX subset: every model reference must be in the selected manifest context. */
export function validateDax(
  dax: string,
  context: SelectedContext,
  manifest: BiManifest,
  maxRows: number,
): { measures: string[]; columns: string[] } {
  if (!dax || dax.length > 5000 || /[;{}]|\/\*|\*\/|--|\/\//.test(dax)) {
    throw new DaxGuardError('DAX vazio, longo demais ou com sintaxe não permitida.')
  }
  const compact = dax.trim()
  if (!/^EVALUATE\s+/i.test(compact) || /\bDEFINE\b|\bEVALUATE\b[\s\S]*\bEVALUATE\b/i.test(compact)) {
    throw new DaxGuardError('Use uma única consulta EVALUATE, sem DEFINE.')
  }
  if (/\b(?:INFO|CROSSJOIN|GENERATE|NATURALINNERJOIN|NATURALLEFTOUTERJOIN|CONCATENATEX|FORMAT|DIVIDE|IF|SWITCH|SUMX|AVERAGEX|MINX|MAXX)\s*\(/i.test(compact)
    || /\$SYSTEM|TMSCHEMA|MDSCHEMA/i.test(compact)) {
    throw new DaxGuardError('Consulta de metadados ou varredura não permitida.')
  }
  if (/\bALL\s*\(\s*'?Dim_Operacao_PxR'?\s*\)/i.test(compact)) {
    throw new DaxGuardError('ALL(Dim_Operacao_PxR) inclui a linha em branco; use uma medida oficial.')
  }
  const shape = /^EVALUATE\s+(ROW|TOPN)\s*\(/i.exec(compact)?.[1]?.toUpperCase()
  if (!shape) throw new DaxGuardError('Use ROW para totais ou TOPN sobre SUMMARIZECOLUMNS para detalhamento.')
  if (shape === 'TOPN') {
    const match = /^EVALUATE\s+TOPN\s*\(\s*(\d+)\s*,\s*SUMMARIZECOLUMNS\s*\(/i.exec(compact)
    if (!match || Number(match[1]) < 1 || Number(match[1]) > maxRows) {
      throw new DaxGuardError(`Detalhamento exige TOPN(1..${maxRows}, SUMMARIZECOLUMNS(...)).`)
    }
  }
  let depth = 0
  const structural = compact.replace(/"(?:[^"]|"")*"/g, '""').replace(/'((?:[^']|'')+)'/g, "'T'")
  for (const character of structural) {
    if (character === '(') depth++
    if (character === ')' && --depth < 0) throw new DaxGuardError('Parênteses DAX inválidos.')
  }
  if (depth !== 0) throw new DaxGuardError('Parênteses DAX inválidos.')

  const usedMeasures = new Set<string>()
  const usedColumns = new Set<string>()
  // Strings are labels and filter values; they cannot introduce model identifiers.
  let rest = compact.replace(/"(?:[^"]|"")*"/g, ' ')
  rest = rest.replace(/(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_]*))\s*\[([^\]]+)\]/g,
    (_full, quoted: string | undefined, plain: string | undefined, member: string) => {
      const tableName = (quoted ?? plain ?? '').replace(/''/g, "'")
      const table = manifest.tables.find((item) => item.name.toLowerCase() === tableName.toLowerCase())
      if (!table || !table.queryable || !context.tables.some((item) => item.name === table.name)) {
        throw new DaxGuardError(`Tabela fora do contexto autorizado: ${tableName}.`)
      }
      const column = findByName(table.columns, member)
      const measure = findByName(manifest.measures, member)
      if (column) {
        if (shape === 'TOPN' && table.fact && column?.semanticRole !== 'dimension') {
          throw new DaxGuardError('Detalhamento de colunas da tabela factual não permitido; use dimensões e medidas.')
        }
        if (!column.queryable || (column.restricted && !context.allowRestricted) || column.presentationOnly || !context.columns.some((item) => item.name === column.name && item.table === table.name)) {
          throw new DaxGuardError(`Coluna fora do contexto autorizado: ${tableName}[${member}].`)
        }
        usedColumns.add(`${table.name}[${column.name}]`)
      } else if (measure && measure.table === table.name) {
        if (!measure.queryable || (measure.restricted && !context.allowRestricted) || measure.presentationOnly || !context.measures.includes(measure)) {
          throw new DaxGuardError(`Medida fora do contexto autorizado: ${member}.`)
        }
        usedMeasures.add(measure.name)
      } else {
        throw new DaxGuardError(`Objeto DAX desconhecido: ${tableName}[${member}].`)
      }
      return ' '
    })
  rest = rest.replace(/\[([^\]]+)\]/g, (_full, name: string) => {
    const measure = findByName(context.measures, name)
    if (!measure || !measure.queryable || (measure.restricted && !context.allowRestricted) || measure.presentationOnly) {
      throw new DaxGuardError(`Medida fora do contexto autorizado: [${name}].`)
    }
    usedMeasures.add(measure.name)
    return ' '
  })
  if (/[+*/-]/.test(rest)) throw new DaxGuardError('Aritmética livre não permitida; use medidas oficiais.')
  if (/[\[\]']/.test(rest)) throw new DaxGuardError('Referência DAX não reconhecida.')
  for (const token of rest.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []) {
    if (!DAX_WORDS.has(token.toUpperCase())) throw new DaxGuardError(`Identificador DAX não autorizado: ${token}.`)
  }
  if (usedMeasures.size === 0) throw new DaxGuardError('A consulta precisa usar uma medida oficial do manifesto.')
  const direct = /\b(?:SUM|AVERAGE|MIN|MAX)\s*\(\s*(?:'((?:[^']|'')+)'|([A-Za-z_]\w*))\s*\[([^\]]+)\]/gi
  for (const match of compact.matchAll(direct)) {
    const table = manifest.tables.find((item) => item.name.toLowerCase() === (match[1] ?? match[2]).toLowerCase())
    const column = table && findByName(table.columns, match[3])
    if (!manifest.policy.allowDirectColumnAggregation || !column?.aggregatable) {
      throw new DaxGuardError('Agregação direta de coluna não autorizada; use a medida oficial.')
    }
  }
  return { measures: [...usedMeasures], columns: [...usedColumns] }
}
