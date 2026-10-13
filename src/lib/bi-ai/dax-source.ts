/** Semantic expressions come from the live model definition, never a question-specific recipe. */
export interface DaxSourceVariable { name: string; expression: string; dependencies: string[]; aliases: string[] }
export interface DaxSemanticSource { measure: string; table: string; description: string; variables: DaxSourceVariable[] }

/** Keep offsets while hiding comments, strings and quoted identifiers from structural parsing. */
export function maskDax(value: string): string {
  const chars = value.split('')
  for (let i = 0; i < chars.length; i++) {
    const start = i, character = chars[i]
    if (character === '/' && chars[i + 1] === '*' ) {
      i += 2
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) i++
      i++
    } else if ((character === '/' && chars[i + 1] === '/') || (character === '-' && chars[i + 1] === '-')) {
      while (i < chars.length && chars[i] !== '\n') i++
      i--
    } else if (character === '"' || character === "'" || character === '[') {
      const close = character === '[' ? ']' : character
      while (++i < chars.length) {
        if (chars[i] !== close) continue
        if (chars[i + 1] === close) { i++; continue }
        break
      }
    } else continue
    for (let j = start; j <= i && j < chars.length; j++) if (chars[j] !== '\n') chars[j] = ' '
  }
  return chars.join('')
}

export function sourceVariables(expression: string): DaxSourceVariable[] {
  const body = expression.trim().replace(/^```(?:dax)?\s*|\s*```$/gi, '')
  const masked = maskDax(body), declarations: { name: string; start: number; expressionStart: number; end: number }[] = []
  let depth = 0, returned = false
  const tokens = [...masked.matchAll(/\bVAR\s+([A-Za-z_][A-Za-z0-9_]*)\s*=|\bRETURN\b|[(){}]/gi)]
  for (const token of tokens) {
    const value = token[0], offset = token.index!
    if ('({'.includes(value)) { depth++; continue }
    if (')}'.includes(value)) { depth--; continue }
    if (depth !== 0) continue
    if (declarations.length) declarations.at(-1)!.end = offset
    if (value.toUpperCase() === 'RETURN') { returned = true; break }
    declarations.push({ name: token[1], start: offset, expressionStart: offset + value.length, end: body.length })
  }
  if (!returned) return []
  const names = new Map(declarations.map(declaration => [declaration.name.toLowerCase(), declaration.name]))
  const variables = declarations.map(declaration => {
    const expression = body.slice(declaration.expressionStart, declaration.end).trim()
    const dependencies = [...new Set([...maskDax(expression).matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)]
      .map(match => names.get(match[0].toLowerCase())).filter((name): name is string => !!name))]
    const aliases = [...new Set([...expression.matchAll(/"((?:[^"]|"")+?)"\s*,/g)].map(match => match[1].replaceAll('""', '"')))]
    return { name: declaration.name, expression, dependencies, aliases }
  })
  const blocked = new Set(variables.filter(variable => variable.expression.length > 90_000
    || /<\s*(?:html|style|script|div|span|table|svg|label|input|button)\b|data:image|base64|https?:\/\/|\b(?:Sql|PostgreSQL|Odbc|Web)\.|\b(?:password|client_secret|api[_-]?key)\s*=/i.test(variable.expression)).map(variable => variable.name))
  let changed = true
  while (changed) {
    changed = false
    for (const variable of variables) if (!blocked.has(variable.name) && variable.dependencies.some(name => blocked.has(name))) {
      blocked.add(variable.name); changed = true
    }
  }
  return variables.filter(variable => !blocked.has(variable.name))
}

/** Resolve only the dependencies used by a query, preserving the model's evaluation order. */
export function resolveSourceVariables(source: DaxSemanticSource, query: string): DaxSourceVariable[] {
  const code = maskDax(query).toLowerCase(), needed = new Set<string>()
  const add = (name: string) => {
    if (needed.has(name)) return
    const variable = source.variables.find(variable => variable.name === name)
    if (!variable) throw new Error('Variável da definição publicada indisponível.')
    needed.add(name); variable.dependencies.forEach(add)
  }
  for (const variable of source.variables) if (new RegExp(`\\b${variable.name}\\b`, 'i').test(code)) add(variable.name)
  return source.variables.filter(variable => needed.has(variable.name))
}
