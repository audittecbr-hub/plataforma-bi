import type { BiManifest, BiObject } from './manifest'

/**
 * Tabela "IA" de cada modelo: medidas certificadas que reproduzem os indicadores publicados
 * (paridade conferida com os visuais), com dimensões próprias ("IA Regional", "IA Produto"...),
 * as dimensões do modelo citadas entre aspas simples na descrição da tabela IA (ex.: 'Dim_Operacao_PxR',
 * quando o modelo já tem dimensões relacionadas) e o calendário. Quando existe, é o caminho preferido da IA.
 */
export const IA_TABLE = 'IA'

const DIMENSAO = /^IA\s/
const CALENDARIO = /^d?\s*calend[aá]rio$/i

/** Dimension tables made for the IA measures ("IA Regional", "IA Área"...): their descriptions list the valid members. */
export function isCertifiedDimension(table: string | undefined): boolean {
  return !!table && DIMENSAO.test(table)
}

export function certifiedMeasures(manifest: BiManifest): BiObject[] {
  return manifest.measures.filter(measure => measure.table === IA_TABLE && measure.queryable && !measure.presentationOnly)
}

/** Tables that cut the certified measures: "IA ..." tables, tables the IA table description names, and the calendar. */
function certifiedDimensionTables(manifest: BiManifest): Set<string> {
  const descricao = manifest.tables.find(table => table.name === IA_TABLE)?.description ?? ''
  const declaradas = new Set([...descricao.matchAll(/'((?:[^']|'')+)'/g)].map(match => match[1].replace(/''/g, "'")))
  return new Set(manifest.tables.filter(table => table.queryable && table.name !== IA_TABLE
    && (DIMENSAO.test(table.name) || CALENDARIO.test(table.name) || declaradas.has(table.name))).map(table => table.name))
}

/** Columns made to cut the certified measures, plus the model's calendar. */
export function certifiedDimensions(manifest: BiManifest): BiObject[] {
  const tabelas = certifiedDimensionTables(manifest)
  return manifest.tables.filter(table => tabelas.has(table.name))
    .flatMap(table => table.columns).filter(column => column.queryable && !column.restricted)
}

function semTextos(dax: string): string {
  return dax.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?:\/\/|--)[^\n]*/g, ' ').replace(/"(?:[^"]|"")*"/g, '""')
}

/**
 * A query reads only certified measures, cut by IA dimensions and the calendar: the business rule is the
 * published one, already checked against the visuals. Any base-table column or other measure means the rule
 * may have been rebuilt, and the plan keeps the regular review.
 */
export function certifiedOnly(dax: string, manifest: BiManifest): boolean {
  const certificadas = new Set(certifiedMeasures(manifest).map(measure => measure.name.toLowerCase()))
  if (!certificadas.size) return false
  const outras = new Set(manifest.measures.filter(measure => measure.table !== IA_TABLE).map(measure => measure.name.toLowerCase()))
  const dimensoes = new Set([...certifiedDimensionTables(manifest)].map(nome => nome.toLowerCase()))
  let usaCertificada = false
  for (const [, quoted, plain, inner] of semTextos(dax).matchAll(/(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))?\[([^\]]+)\]/g)) {
    const tabela = (quoted ?? plain)?.replace(/''/g, "'")
    const nome = inner.toLowerCase()
    if (!tabela || tabela === IA_TABLE) {
      if (certificadas.has(nome)) usaCertificada = true
      else if (outras.has(nome)) return false
      continue
    }
    if (dimensoes.has(tabela.toLowerCase())) continue
    return false
  }
  return usaCertificada
}

/** Orientação ao planejador quando o modelo tem a tabela IA. */
export const CERTIFIED_INSTRUCTIONS = `Este modelo tem a tabela IA: medidas certificadas que reproduzem os indicadores publicados no relatório, com as regras já aplicadas (deduplicação, regras de corte, origem, estoques). Para qualquer indicador coberto por elas, use SOMENTE essas medidas em DAX simples, recortando pelas dimensões citadas na descrição de cada uma (tabelas que começam com "IA ", as dimensões citadas na descrição da tabela IA e o calendário do modelo). Não reconstrua a regra com colunas da base, não use variáveis de medidas HTML e não inspecione os visuais para esses indicadores. A descrição recebida de cada medida IA e de cada dimensão IA já é a definição completa: não use inspect, inspect-source nem search-catalog nelas; escreva a consulta final direto. Filtre as dimensões IA com os valores exatos listados na descrição da coluna (ex.: "Regional Sul", não "Sul"). Período: filtre a coluna de data do calendário com DATESBETWEEN, ou o ano e o número do mês; não filtre colunas de texto de mês (o formato delas varia). Sem período, a descrição informa o padrão. Estoques e fotos não se somam entre meses. Ranking: EVALUATE TOPN(n, SUMMARIZECOLUMNS('IA ...'[Coluna], filtros, "Valor", [Medida]), [Valor], DESC) ORDER BY [Valor] DESC, preservando empates. Comparações e evoluções: a mesma medida em cada período, uma linha ou coluna por mês, nunca um único total do intervalo. Prefira essas medidas a report-facts sempre que houver recorte, comparação, ranking ou cruzamento. Pergunta sobre o significado ou a regra de um indicador: a descrição da medida IA já é a regra; responda com model-info, sem explorar dados. Use DAX livre sobre a base somente para o que nenhuma medida IA cobre.`
