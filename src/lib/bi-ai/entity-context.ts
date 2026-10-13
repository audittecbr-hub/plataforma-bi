/** A job code is an entity identifier, not a report period or aggregate indicator. */
export function jobCodeIn(question: string): string | null {
  const explicit = [...question.matchAll(/\bjobs?\s*(?:de\s+(?:codigo|código)\s*|(?:codigo|código)\s*|[#:])?\s*["']?([a-z0-9]+(?:[-_][a-z0-9]+)*)/gi)]
    .map(match => match[1]).filter(code => /\d/.test(code) && code.length <= 100)
  const codes = [...new Set([...explicit, ...[...question.matchAll(/\b(\d{3,}[-_][a-z][a-z0-9_-]*)\b/gi)].map(match => match[1])].map(code => code.toUpperCase()))]
  return codes.length === 1 ? codes[0] : null
}

export function isJobContinuation(question: string): boolean {
  return /^(?:(?:eu )?quero (?:tudo|todos os detalhes|todos os dados)|(?:me )?(?:fale|mostre|traga|diga) mais|mais (?:informacoes|informações|detalhes)|detalhe (?:tudo|mais)|(?:e )?(?:os |as |o |a )?(?:honorarios|honorários|creditos|créditos|etapas|produtos|aprovacoes|aprovações|status|cadastro|linha do tempo))(?:\b|\?|$)/i.test(question.trim())
}

export function isGeneralJobLookup(question: string): boolean {
  // Only a request for the dossier qualifies. Unknown filters must reach the planner.
  const code = jobCodeIn(question)
  if (!code) return false
  const terms = question.replace(new RegExp(`\\b${code}\\b`, 'gi'), ' ')
    .replace(/Sobre o job\s*; consultar os registros disponíveis do job no modelo\./i, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  const allowed = new Set(('me fale falar mais sobre esse essa este esta desse dessa dele dela do da de o a os as e job jobs codigo '
    + 'quero eu tudo todos todas completo completa detalhes detalhamento detalhe detalhar dados informacoes informacao '
    + 'mostre mostrar traga trazer diga dizer explique explicar conte contar registros registro cadastro status etapas etapa '
    + 'produtos produto honorarios encontrados creditos credito aprovacao aprovacoes negociacao reuniao tecnica cliente '
    + 'historico resumo linha tempo por favor esclarecimento usuario').split(' '))
  return terms.every(term => allowed.has(term))
}

export function resolveJobContext(question: string, history: { question: string; answer: string }[], pendingQuestion?: string) {
  const explicit = jobCodeIn(question)
  if (explicit) return { question, jobCode: explicit, inherited: false }
  if (!isJobContinuation(question)) return { question, jobCode: null, inherited: false }
  // Do not revive a job after the user has moved to another subject.
  const prior = jobCodeIn(pendingQuestion ?? history.at(-1)?.question ?? '')
  if (!prior) return { question, jobCode: null, inherited: false }
  return { question: `${question.trim()}\nSobre o job ${prior}; consultar os registros disponíveis do job no modelo.`, jobCode: prior, inherited: true }
}
