import type { BiManifest } from './manifest'
import type { PublishedSchema } from './fabric-schema'
import { daxObjectReferences } from './dax-source'

/** Resolve actual native inputs and flag broken dependencies without changing query permissions. */
export function nativeMeasureRules(expressions: string[], schema: PublishedSchema, manifest: BiManifest) {
  const names = new Set(expressions.flatMap(daxObjectReferences).flatMap(reference => schema.measures
    .filter(measure => measure.name.toLowerCase() === reference.name.toLowerCase()
      && (!reference.table || measure.table.toLowerCase() === reference.table.toLowerCase())).map(measure => measure.name)))
  const missingTables = (name: string, visiting = new Set<string>()): string[] => {
    if (visiting.has(name)) return []
    const next = new Set(visiting).add(name), measure = schema.measures.find(measure => measure.name === name)
    if (!measure) return []
    return daxObjectReferences(measure.expression).flatMap(reference => {
      if (reference.table && !manifest.tables.some(table => table.name.toLowerCase() === reference.table!.toLowerCase())) return [reference.table]
      const dependency = schema.measures.find(measure => measure.name.toLowerCase() === reference.name.toLowerCase()
        && (!reference.table || measure.table.toLowerCase() === reference.table.toLowerCase()))
      return dependency ? missingTables(dependency.name, next) : []
    })
  }
  return schema.measures.filter(measure => names.has(measure.name)).map(measure => ({ name: measure.name, table: measure.table,
    expression: measure.expression, missingTables: [...new Set(missingTables(measure.name))] }))
}
