import { asRecord, safeText } from './manifest'
import { daxFunctionArguments, sourceTableFields, type DaxSemanticSource } from './dax-source'

/** A published GROUPBY already defines both its row grain and exact arithmetic. */
export function publishedAggregations(source: DaxSemanticSource) {
  const shapes = sourceTableFields(source)
  return source.variables.flatMap(variable => {
    const call = daxFunctionArguments(variable.expression)
    if (call?.name !== 'GROUPBY') return []
    const metrics: { name: string; expression: string }[] = []
    for (let i = 1; i < call.args.length; i++) {
      const literal = /^"((?:[^"\n]|"")*)"$/.exec(call.args[i])
      if (!literal) continue
      const expression = call.args[++i], aggregation = expression && daxFunctionArguments(expression)
      if (!aggregation || !/^(?:SUMX|MINX|MAXX|AVERAGEX|COUNTX|COUNTAX|PRODUCTX|STDEVX\.S|STDEVX\.P)$/.test(aggregation.name)
        || aggregation.args[0]?.replace(/\s+/g, '').toUpperCase() !== 'CURRENTGROUP()') continue
      metrics.push({ name: literal[1].replaceAll('""', '"'), expression })
    }
    if (!metrics.length) return []
    const base = call.args[0]
    return [{ variable: variable.name, base, fields: shapes.get(base), metrics }]
  })
}

/** Regroup published row rules; the model chooses scope/dimensions, not new arithmetic. */
export function compileSourceAnalysis(raw: Record<string, unknown>, sources: DaxSemanticSource[]) {
  let source = sources.find(source => source.measure.toLowerCase() === safeText(raw.sourceMeasure, 200).replace(/^\[|\]$/g, '').toLowerCase())
  if (!source) throw new Error('Informe o nome exato de uma fonte publicada.')
  if (!Array.isArray(raw.metrics) || !raw.metrics.length || raw.metrics.length > 20) throw new Error('Selecione os indicadores da agregação publicada.')
  const requested = raw.metrics.map(value => typeof value === 'string' ? value : safeText(asRecord(value).name, 200)).map(name => name.toLowerCase())
  const variable = safeText(raw.variable, 200).toLowerCase()
  const candidates = sources.flatMap(source => publishedAggregations(source).filter(aggregate =>
    (aggregate.variable.toLowerCase() === variable || aggregate.base.toLowerCase() === variable)
    && requested.every(name => aggregate.metrics.some(metric => metric.name.toLowerCase() === name))).map(aggregate => ({ source, aggregate })))
  const own = candidates.filter(candidate => candidate.source === source)
  const found = own.length === 1 ? own[0] : candidates.length === 1 ? candidates[0] : undefined
  if (!found) throw new Error(`Indicador ou agregação ausente/ambíguo. Selecione uma regra publicada: ${publishedAggregations(source)
    .map(aggregate => `${aggregate.variable} (${aggregate.metrics.map(metric => metric.name).join(', ')})`).join('; ').slice(0, 1000)}`)
  source = found.source
  const aggregate = found.aggregate
  const metrics = raw.metrics.map(value => {
    const object = asRecord(value), name = typeof value === 'string' ? value : safeText(object.name, 200)
    const metric = aggregate.metrics.find(metric => metric.name.toLowerCase() === name.toLowerCase())
    if (!metric) throw new Error('Indicador ausente nesta agregação publicada.')
    return { ...metric, label: safeText(object.label, 100) || name }
  })
  if (new Set(metrics.map(metric => metric.label.toLowerCase())).size !== metrics.length) throw new Error('Use rótulos diferentes para os indicadores.')
  const dimensions = (Array.isArray(raw.groupBy) ? raw.groupBy : []).map(value => {
    const dimension = asRecord(value), name = safeText(dimension.name, 100), expression = safeText(dimension.expression, 4000)
    if (typeof dimension.expression !== 'string' || dimension.expression.length > 4000) throw new Error('A dimensão deve ser uma expressão DAX de até 4000 caracteres.')
    if (!name || !expression) throw new Error('Informe nome e expressão das dimensões.')
    return { name, expression }
  })
  if (dimensions.length > 12 || !dimensions.length) throw new Error('Informe de uma a doze dimensões para o cruzamento.')
  if (new Set([...dimensions.map(dimension => dimension.name), ...metrics.map(metric => metric.label)].map(name => name.toLowerCase())).size !== dimensions.length + metrics.length) {
    throw new Error('Use rótulos diferentes para as dimensões e indicadores.')
  }
  const existing = new Set(source.variables.flatMap(variable => variable.aliases))
  const aliases = dimensions.map((_, index) => {
    let name = `__biDimension${index}`
    while (existing.has(name)) name += '_'
    existing.add(name); return name
  })
  const quote = (text: string) => `"${text.replaceAll('"', '""')}"`
  const field = (name: string) => `[${name.replaceAll(']', ']]')}]`
  if (raw.filter !== undefined && typeof raw.filter !== 'string' || typeof raw.filter === 'string' && raw.filter.length > 8000) throw new Error('O filtro deve ser um predicado DAX, em texto.')
  if (raw.top !== undefined && (!raw.top || typeof raw.top !== 'object' || Array.isArray(raw.top))) throw new Error('Informe count e metric no ranking.')
  const filter = safeText(raw.filter, 8000)
  const rows = filter ? `FILTER(${aggregate.base}, ${filter})` : aggregate.base
  const table = `ADDCOLUMNS(${rows}, ${dimensions.map((dimension, index) => `${quote(aliases[index])}, ${dimension.expression}`).join(', ')})`
  let expression = `GROUPBY(${table}, ${aliases.map(field).join(', ')}, ${metrics.map(metric => `${quote(metric.label)}, ${metric.expression}`).join(', ')})`
  const top = asRecord(raw.top)
  if (top.count !== undefined) {
    if (top.descending !== undefined && typeof top.descending !== 'boolean') throw new Error('descending deve ser true ou false.')
    if (!Number.isInteger(top.count) || Number(top.count) < 1 || Number(top.count) > 100000) throw new Error('Quantidade do ranking inválida.')
    const order = metrics.find(metric => metric.name === top.metric || metric.label === top.metric)
    if (!order) throw new Error('Ordene por um indicador consultado.')
    expression = `TOPN(${Number(top.count)}, ${expression}, ${field(order.label)}, ${top.descending === false ? 'ASC' : 'DESC'})`
  }
  const projections = [...dimensions.map((dimension, index) => `${quote(dimension.name)}, ${field(aliases[index])}`),
    ...metrics.map(metric => `${quote(metric.label)}, ${field(metric.label)}`)]
  const ordering = top.count !== undefined ? metrics.find(metric => metric.name === top.metric || metric.label === top.metric)! : null
  const dax = `EVALUATE SELECTCOLUMNS(${expression}, ${projections.join(', ')})${ordering ? ` ORDER BY ${field(ordering.label)} ${top.descending === false ? 'ASC' : 'DESC'}` : ''}`
  return { purpose: safeText(raw.purpose, 1000) || 'Análise com regras publicadas', dax, sourceMeasure: source.measure,
    maxRows: Math.max(top.count === 1 ? 100 : 1, Math.min(100000,
      typeof raw.maxRows === 'number' && Number.isInteger(raw.maxRows) ? raw.maxRows : Math.max(100, Number(top.count) || 0))) }
}
