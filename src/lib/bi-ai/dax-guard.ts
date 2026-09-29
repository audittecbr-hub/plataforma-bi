import type { BiManifest, BiObject } from './manifest'
import type { SelectedContext } from './context'

export class DaxGuardError extends Error {}

/**
 * O que realmente é perigoso em DAX, e só isso.
 *
 * DAX é uma linguagem de consulta: não existe INSERT/UPDATE/DELETE/DROP/EXEC, então
 * não há como alterar o modelo ou executar código. As únicas superfícies reais são:
 *  1. reconhecimento de metadados  → INFO.* / INFO.VIEW.* / $SYSTEM / DMVs
 *  2. alcance a fonte remota       → EXTERNALMEASURE e referências a conector M
 *  3. alterar a definição          → DEFINE TABLE / DEFINE COLUMN
 *
 * DIVIDE, IF, SWITCH, SUMX, AVERAGEX, FORMAT, CONCATENATEX e aritmética NÃO são
 * vetores — e bloqueá-los impedia o chat de responder qualquer percentual, desvio
 * ou comparação. Verificado em 29/09/2026: o endpoint executeQueries aceita todos.
 *
 * A proteção efetiva é o catálogo de objetos validado mais abaixo e o limite
 * explícito de linhas na saída da consulta.
 */
const METADADOS = /(?:\bINFO(?:\.[A-Z]+)*\s*\(|\$SYSTEM\b|\bTMSCHEMA\b|\bMDSCHEMA\b|\bEXTERNALMEASURE\s*\(|\bDEFINE\s+(?:TABLE|COLUMN)\b)/i

/** Referência a conector do Power Query dentro do DAX (Sql.Database, Odbc.Query, Web.Contents...). */
const FONTE_EXTERNA = /\b(?:Sql|PostgreSQL|Odbc|OData|Web|Excel|Csv|Folder|SharePoint|AzureStorage|Snowflake|Oracle|MySQL|Teradata|BigQuery|Databricks|GoogleAnalytics|Salesforce|Access|SapHana|Vertica|AmazonRedshift)\s*\./i

function findByName(items: BiObject[], name: string): BiObject | undefined {
  return items.find((item) => item.name.toLowerCase() === name.toLowerCase())
}

/**
 * Validação de segurança: todo objeto referenciado precisa existir no modelo
 * autorizado. Funções e aritmética ficam livres dentro de ROW ou TOPN.
 */
export function validateDax(
  dax: string,
  context: SelectedContext,
  manifest: BiManifest,
  maxRows: number,
): { measures: string[]; columns: string[] } {
  if (!dax || dax.length > 20000 || /;|\/\*|\*\/|\/\//.test(dax)) {
    throw new DaxGuardError('DAX vazio, longo demais ou com sintaxe não permitida.')
  }
  const compact = dax.trim()
  if (!/^EVALUATE\s+/i.test(compact) || /\bDEFINE\b|\bEVALUATE\b[\s\S]*\bEVALUATE\b/i.test(compact)) {
    throw new DaxGuardError('Use uma única consulta EVALUATE, sem DEFINE.')
  }
  if (METADADOS.test(compact)) {
    throw new DaxGuardError('Consulta de metadados do modelo não é permitida.')
  }
  if (FONTE_EXTERNA.test(compact)) {
    throw new DaxGuardError('Referência a fonte de dados externa não é permitida.')
  }
  const outer = /^EVALUATE\s+(ROW|TOPN)\s*\(/i.exec(compact)
  if (!outer) {
    throw new DaxGuardError('A consulta deve retornar uma linha com ROW ou um detalhe limitado com TOPN.')
  }
  const topN = /^EVALUATE\s+TOPN\s*\(\s*(\d+)\s*,/i.exec(compact)
  if (outer[1].toUpperCase() === 'TOPN' && (!topN || Number(topN[1]) < 1 || Number(topN[1]) > maxRows)) {
    throw new DaxGuardError(`O detalhamento pede mais de ${maxRows} linhas; reduza o TOPN.`)
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
  const usedTables = new Set<string>()
  const aliases = new Set<string>()
  for (const match of compact.matchAll(/"((?:[^"]|"")+?)"\s*,\s*(?:(?:CALCULATE|DIVIDE|IF|SWITCH|SUMX|SUM|AVERAGE|MIN|MAX|FORMAT|ABS|ROUND)\s*\(|\[[^\]]+\]|(?:'[^']+'|[A-Za-z_]\w*)\s*\[[^\]]+\])/gi)) {
    aliases.add(match[1].replace(/""/g, ''))
  }
  for (const match of compact.matchAll(/"((?:[^"]|"")+?)"\s*,\s*(?:CALCULATE\s*\(\s*)?\[([^\]]+)\]/gi)) {
    if (findByName(context.measures, match[2])) aliases.add(match[1].replace(/""/g, ''))
  }
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
  rest = rest.replace(/'((?:[^']|'')+)'/g, (_full, quoted: string) => {
    const name = quoted.replace(/''/g, "'")
    const table = manifest.tables.find((item) => item.name.toLowerCase() === name.toLowerCase())
    if (!table?.queryable || !context.tables.some((item) => item.name === table.name)) {
      throw new DaxGuardError(`Tabela fora do contexto autorizado: ${name}.`)
    }
    usedTables.add(table.name)
    return ' '
  })
  rest = rest.replace(/\[([^\]]+)\]/g, (_full, name: string) => {
    const measure = findByName(context.measures, name)
    if (!measure && aliases.has(name)) return ' '
    if (!measure || !measure.queryable || (measure.restricted && !context.allowRestricted) || measure.presentationOnly) {
      throw new DaxGuardError(`Medida fora do contexto autorizado: [${name}].`)
    }
    usedMeasures.add(measure.name)
    return ' '
  })
  if (/[\[\]']/.test(rest)) throw new DaxGuardError('Referência DAX não reconhecida.')
  if (usedMeasures.size === 0 && usedColumns.size === 0 && usedTables.size === 0) {
    throw new DaxGuardError('A consulta precisa usar uma tabela, medida ou coluna do modelo autorizado.')
  }
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
