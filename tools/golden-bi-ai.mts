/**
 * Medidor do conjunto de teste (golden set) do Chat IA.
 *
 * Roda cada pergunta pelo mesmo pipeline da produção, sem gravar nada no banco do portal
 * (histórico, logs e limite de uso ficam em memória), recalcula o oráculo DAX na hora e mede
 * cada chamada de IA, cada consulta DAX e cada leitura do Fabric.
 *
 * Uso:
 *   node --conditions=react-server --env-file=.env.local --import tsx tools/golden-bi-ai.mts <casos.json> [mais.json...] --out <saida.json>
 *     [--ids reg-001,reg-002] [--categorias kpi,ranking] [--limite 10] [--concorrencia 2]
 *     [--provedor opencode-go] [--modelo deepseek-v4.1-flash] [--raciocinio high] [--retrato]
 *   --retrato lê a definição pelo retrato sincronizado, como a rota da Fase 1; sem ele, relê o Fabric como a versão anterior.
 *   --so-oraculo só calcula as respostas de referência, sem perguntar à IA.
 * O formato dos casos está em plano-ia-portal-2026-10-13/golden/FORMATO.md.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createAdminClient } from '../src/utils/supabase/admin'
import { withAiRequestCache } from '../src/lib/ai-request-cache'
import { lerConfigIa, type ConfigIa } from '../src/lib/llm-config'
import { isReasoningEffort } from '../src/lib/ai-reasoning'
import { manifestForDashboard } from '../src/lib/bi-ai/registry'
import { answerBiQuestion } from '../src/lib/bi-ai/pipeline'
import { mapConcurrent } from '../src/lib/bi-ai/concurrency'
import { executeDaxQuery } from '../src/lib/powerbi'
import { publishedSchema } from '../src/lib/bi-ai/fabric-context'
import { loadReportFacts } from '../src/lib/bi-ai/report-reference'
import { validateReportReferences } from '../src/lib/bi-ai/report-evidence'
import type { BiManifest } from '../src/lib/bi-ai/manifest'
import type { DashboardRow } from '../src/lib/bi-ai/access'

/** percentual: fração (0,65); pontos: percentual já em pontos (65), como os cards do relatório. */
type Formato = 'moeda' | 'numero' | 'percentual' | 'pontos' | 'inteiro'
interface ValorEsperado { rotulo: string; coluna: string; formato?: Formato; tolerancia?: number }
interface Caso {
  id: string
  dashboardId: string
  categoria: string
  pergunta: string
  anterior?: string | null
  esperado: {
    tipo: 'valores' | 'ranking' | 'tabela' | 'texto' | 'esclarecimento' | 'projecao'
    valores?: ValorEsperado[]
    n?: number
    formato?: Formato
    tolerancia?: number
    termos?: string[]
    proibidos?: string[]
  }
  oraculo?: { dax?: string; contratos?: OraculoContrato[]; conferencia?: string }
}

/** Número lido do próprio visual publicado, pelo contrato do relatório (o que a tela mostra). */
interface OraculoContrato {
  entidade: string
  measure: string
  metricId: string
  scope: { months: string[]; region?: string | null; products?: string[] | null }
}

interface UsoProvedor {
  prompt_tokens?: number; input_tokens?: number; cache_read_input_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens?: number; output_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number }
}

interface Chamada {
  tipo: 'ia' | 'dax' | 'fabric' | 'supabase' | 'entra' | 'outro'
  etapa?: string
  ms: number
  status: number
  promptChars?: number
  esforco?: string
  promptTokens?: number
  cachedTokens?: number
  saidaTokens?: number
  raciocinioTokens?: number
  /** Início do texto devolvido (o JSON do plano), para ver a ação escolhida em cada etapa. */
  saida?: string
}

interface Rastro { chamadas: Chamada[]; pendentes: Promise<unknown>[]; dax: { ms: number; linhas: number; status: string; consulta: string }[] }

const rastro = new AsyncLocalStorage<Rastro>()

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

function tipoDaUrl(url: string): Chamada['tipo'] {
  if (/\/chat\/completions$|\/messages$|\/responses$/.test(url)) return 'ia'
  if (url.includes('/executeQueries')) return 'dax'
  if (url.includes('api.fabric.microsoft.com') || /analysis\.windows\.net\/v1\/operations/.test(url)) return 'fabric'
  if (url.includes('.supabase.co')) return 'supabase'
  if (url.includes('login.microsoftonline.com')) return 'entra'
  return 'outro'
}

function etapaDoPrompt(sistema: string): string {
  if (sistema.startsWith('Revise o plano DAX')) return 'revisao'
  if (sistema.includes('foi recusada pelo Power BI')) return 'correcao'
  // Com a tabela IA, a orientação dela vem antes das instruções do planejador.
  if (sistema.startsWith('Planeje DAX') || sistema.includes('\nPlaneje DAX')) return 'planejamento'
  if (sistema.startsWith('Explique em português')) return 'explicacao'
  return sistema.slice(0, 40)
}

const fetchOriginal = globalThis.fetch
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const atual = rastro.getStore()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!atual) return fetchOriginal(input, init)
  const inicio = performance.now(), tipo = tipoDaUrl(url)
  const chamada: Chamada = { tipo, ms: 0, status: 0 }
  if (tipo === 'ia' && typeof init?.body === 'string') {
    try {
      const corpo = JSON.parse(init.body)
      const mensagens = corpo.messages ?? corpo.input ?? []
      const sistema = typeof corpo.system === 'string' ? corpo.system : String(mensagens.find((m: { role: string }) => m.role === 'system')?.content ?? '')
      chamada.etapa = etapaDoPrompt(sistema)
      chamada.promptChars = JSON.stringify(mensagens).length
      chamada.esforco = corpo.reasoning_effort ?? corpo.output_config?.effort ?? (corpo.thinking?.type === 'disabled' ? 'none' : undefined)
    } catch { /* corpo não é JSON: mede só o tempo */ }
  }
  atual.chamadas.push(chamada)
  const resposta = await fetchOriginal(input, init)
  chamada.status = resposta.status
  chamada.ms = performance.now() - inicio
  if (tipo === 'ia') {
    const ct = resposta.headers.get('content-type') ?? ''
    const copia = resposta.clone()
    const uso = (u: UsoProvedor | undefined) => {
      if (!u) return
      chamada.promptTokens = u.prompt_tokens ?? u.input_tokens
      chamada.cachedTokens = u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens
      chamada.saidaTokens = u.completion_tokens ?? u.output_tokens
      chamada.raciocinioTokens = u.completion_tokens_details?.reasoning_tokens
    }
    atual.pendentes.push((ct.includes('event-stream') ? copia.text().then(texto => {
      for (const linha of texto.split('\n')) {
        if (!linha.startsWith('data: {')) continue
        try {
          const pedaco = JSON.parse(linha.slice(6))
          if (pedaco.usage) uso(pedaco.usage)
          const texto = pedaco.choices?.[0]?.delta?.content
          if (typeof texto === 'string' && (chamada.saida ?? '').length < 400) chamada.saida = ((chamada.saida ?? '') + texto).slice(0, 400)
        } catch { /* linha parcial */ }
      }
    }) : copia.json().then(j => { uso(j.usage); const texto = j.choices?.[0]?.message?.content; if (typeof texto === 'string') chamada.saida = texto.slice(0, 400) }))
      .catch(() => {}).finally(() => { chamada.ms = performance.now() - inicio }))
  }
  return resposta
}

/* ---------------- números em pt-BR ---------------- */

interface NumeroLido { valor: number; casas: number; percentual: boolean; escala: number }

function numerosDoTexto(texto: string): NumeroLido[] {
  const limpo = texto.replace(/−/g, '-').replace(/ /g, ' ')
  const achados: NumeroLido[] = []
  const re = /(-?)\s?(?:R\$\s*)?(-?)(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(\s*%|\s*(?:mi|milh(?:ão|ões)|bi|bilh(?:ão|ões)|mil)\b)?/gi
  for (const m of limpo.matchAll(re)) {
    const sinal = m[1] === '-' || m[2] === '-' ? -1 : 1
    const bruto = m[3]
    const casas = bruto.includes(',') ? bruto.split(',')[1].length : 0
    const valor = Number(bruto.replace(/\./g, '').replace(',', '.')) * sinal
    const sufixo = (m[4] ?? '').trim().toLowerCase()
    const escala = sufixo.startsWith('bi') ? 1e9 : sufixo.startsWith('mi') ? 1e6 : sufixo === 'mil' ? 1e3 : 1
    if (Number.isFinite(valor)) achados.push({ valor, casas, percentual: sufixo === '%', escala })
  }
  return achados
}

/** 'exato' quando bate na precisão exibida; 'aproximado' quando só bate abreviado (mi/mil). */
function confereNumero(esperado: number, formato: Formato | undefined, tolerancia: number, lidos: NumeroLido[]): 'exato' | 'aproximado' | null {
  let melhor: 'exato' | 'aproximado' | null = null
  for (const lido of lidos) {
    const passo = 0.5 * 10 ** -lido.casas
    if (formato === 'percentual' || formato === 'pontos') {
      const pontos = formato === 'percentual' ? esperado * 100 : esperado
      if (lido.percentual && Math.abs(lido.valor - pontos) <= Math.max(passo, formato === 'percentual' ? tolerancia * 100 : tolerancia) + 1e-9) return 'exato'
      continue
    }
    if (lido.escala === 1) {
      if (Math.abs(lido.valor - esperado) <= Math.max(passo, tolerancia) + 1e-9) return 'exato'
    } else if (Math.abs(lido.valor * lido.escala - esperado) <= passo * lido.escala + 1e-9) melhor = 'aproximado'
  }
  return melhor
}

// A resposta é Markdown: "TAX\_OPE\_02" na tela é "TAX_OPE_02".
const normalizar = (texto: string) => texto.replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function chaveLimpa(chave: string): string {
  return chave.includes('[') ? chave.slice(chave.lastIndexOf('[') + 1).replace(/\]$/, '') : chave
}

async function oraculo(caso: Caso, manifest: BiManifest): Promise<{ linhas: Record<string, unknown>[]; objeto: Record<string, unknown> }> {
  if (caso.oraculo?.contratos?.length) {
    const schema = await publishedSchema(manifest.workspaceId, manifest.semanticModelId, manifest.reportId)
    const contratos = validateReportReferences(manifest, schema)
    const linhas: Record<string, unknown>[] = []
    for (const item of caso.oraculo.contratos) {
      const contrato = contratos.find(c => c.measure === item.measure)
      if (!contrato) throw new Error(`contrato ${item.measure} indisponível`)
      const { facts } = await loadReportFacts(manifest, contrato,
        { months: item.scope.months, region: item.scope.region ?? null, products: item.scope.products ?? null }, [item.metricId])
      linhas.push({ entidade: item.entidade, chave: item.entidade, valor: facts[0]?.value ?? null, precisao: facts[0]?.precision ?? 0 })
    }
    const ordenadas = caso.esperado.tipo === 'ranking' ? [...linhas].sort((a, b) => Number(b.valor) - Number(a.valor)) : linhas
    return { linhas: ordenadas, objeto: Object.fromEntries(linhas.flatMap(l => [[String(l.entidade), l.valor],
      [`${String(l.entidade)}::precisao`, l.precisao]])) }
  }
  if (!caso.oraculo?.dax) return { linhas: [], objeto: {} }
  const linhas = (await executeDaxQuery({ workspaceId: manifest.workspaceId, semanticModelId: manifest.semanticModelId, dax: caso.oraculo.dax }))
    .map(linha => Object.fromEntries(Object.entries(linha).map(([k, v]) => [chaveLimpa(k), v])))
  return { linhas, objeto: linhas[0] ?? {} }
}

function avaliar(caso: Caso, resultado: Record<string, unknown>, linhas: Record<string, unknown>[], objeto: Record<string, unknown>) {
  const texto = String(resultado.answer ?? '')
  const lidos = numerosDoTexto(texto)
  const detalhes: string[] = []
  let aproximado = false
  const esperado = caso.esperado
  // A number read from the visual is already rounded as displayed; its precision is part of the tolerance.
  const confere = (valor: unknown, formato: Formato | undefined, tolerancia: number, rotulo: string, precisao = 0) => {
    if (typeof valor !== 'number') { detalhes.push(`${rotulo}: oráculo sem número`); return false }
    const r = confereNumero(valor, formato, Math.max(tolerancia, precisao), lidos)
    if (r === 'aproximado') aproximado = true
    if (!r) detalhes.push(`${rotulo}: esperado ${valor} não encontrado`)
    return r !== null
  }
  const termos = () => {
    const corpo = normalizar(texto)
    const faltam = (esperado.termos ?? []).filter(t => !corpo.includes(normalizar(t)))
    const indevidos = (esperado.proibidos ?? []).filter(t => corpo.includes(normalizar(t)))
    if (faltam.length) detalhes.push(`termos ausentes: ${faltam.join(', ')}`)
    if (indevidos.length) detalhes.push(`termos indevidos: ${indevidos.join(', ')}`)
    return !faltam.length && !indevidos.length
  }
  let ok = true
  if (esperado.tipo === 'esclarecimento') ok = !!resultado.clarification
  else if (esperado.tipo === 'texto') ok = !!texto && termos()
  else if (esperado.tipo === 'valores' || esperado.tipo === 'projecao') {
    for (const v of esperado.valores ?? []) ok = confere(objeto[v.coluna], v.formato, v.tolerancia ?? 0.01, v.rotulo,
      Number(objeto[`${v.coluna}::precisao`] ?? 0)) && ok
    if (esperado.tipo === 'projecao' || esperado.termos?.length) ok = termos() && ok
  } else if (esperado.tipo === 'ranking' || esperado.tipo === 'tabela') {
    const n = esperado.tipo === 'ranking' ? Math.max(1, esperado.n ?? 1) : linhas.length
    let corte = linhas.slice(0, n)
    if (esperado.tipo === 'ranking' && linhas.length > n) {
      const limite = corte[corte.length - 1]?.valor
      corte = linhas.filter((l, i) => i < n || l.valor === limite)
    }
    const corpo = normalizar(texto)
    const nomes = corte.map(l => normalizar(String(l.entidade ?? l.chave ?? '')))
    // "PIS/COFINS" também aparece dentro de "VERMELHO - PIS/COFINS": ignore ocorrências dentro de outra entidade da lista.
    const ocorrencia = (nome: string) => {
      const maiores = nomes.filter(outro => outro !== nome && outro.includes(nome))
      for (let i = corpo.indexOf(nome); i >= 0; i = corpo.indexOf(nome, i + 1)) {
        if (!maiores.some(outro => { const j = corpo.lastIndexOf(outro, i + nome.length); return j >= 0 && j <= i && j + outro.length >= i + nome.length })) return i
      }
      return -1
    }
    let posicao = -1
    for (const l of corte) {
      const nome = String(l.entidade ?? l.chave ?? '')
      const onde = ocorrencia(normalizar(nome))
      if (onde < 0) { ok = false; detalhes.push(`entidade ausente: ${nome}`); continue }
      if (esperado.tipo === 'ranking' && onde < posicao) { ok = false; detalhes.push(`ordem trocada em ${nome}`) }
      posicao = Math.max(posicao, onde)
      ok = confere(l.valor, esperado.formato, esperado.tolerancia ?? 0.01, nome, Number(l.precisao ?? 0)) && ok
    }
    if (!corte.length) { ok = false; detalhes.push('oráculo vazio') }
  }
  return { ok, aproximado: ok && aproximado, detalhes }
}

function percentil(valores: number[], p: number) {
  if (!valores.length) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  return Math.round(ordenados[Math.min(ordenados.length - 1, Math.round(p / 100 * (ordenados.length - 1)))])
}

async function main() {
  const arquivos = process.argv.slice(2).filter((a, i, todos) => a.endsWith('.json') && todos[i - 1] !== '--out')
  const saida = argumento('out')
  if (!arquivos.length || !saida) throw new Error('Uso: tools/golden-bi-ai.mts <casos.json> [...] --out <saida.json> [opções]')
  let casos: Caso[] = []
  for (const arquivo of arquivos) casos.push(...JSON.parse(await readFile(resolve(arquivo), 'utf8')) as Caso[])
  const ids = argumento('ids')?.split(','), categorias = argumento('categorias')?.split(',')
  if (ids) casos = casos.filter(c => ids.includes(c.id))
  if (categorias) casos = casos.filter(c => categorias.includes(c.categoria))
  if (argumento('limite')) casos = casos.slice(0, Number(argumento('limite')))
  if (!casos.length) throw new Error('Nenhum caso selecionado.')

  const producao = await lerConfigIa()
  const configuracao: ConfigIa = { ...producao, enabled: true,
    provedorId: argumento('provedor') ?? producao.provedorId, modelo: argumento('modelo') ?? producao.modelo }
  const esforco = argumento('raciocinio')
  if (esforco) { if (!isReasoningEffort(esforco)) throw new Error('Nível de raciocínio inválido.'); configuracao.reasoningEffort = esforco }

  const admin = createAdminClient()
  const paineis = new Map<string, DashboardRow>()
  for (const id of new Set(casos.map(c => c.dashboardId))) {
    const { data, error } = await admin.from('dashboards').select('*').eq('id', id).single()
    if (error || !data) throw new Error(`Dashboard indisponível: ${id}`)
    paineis.set(id, data as DashboardRow)
  }
  const memoria = new Map<string, { question: string; answer: string }[]>()
  const retrato = process.argv.includes('--retrato')
  const manifestos = new Map<string, Promise<BiManifest>>()
  const manifestoDe = (painel: DashboardRow) => {
    if (!manifestos.has(painel.id)) manifestos.set(painel.id, withAiRequestCache(() => manifestForDashboard(painel, false)))
    return manifestos.get(painel.id)!
  }
  console.log(JSON.stringify({ casos: casos.length, provedor: configuracao.provedorId, modelo: configuracao.modelo, raciocinio: configuracao.reasoningEffort,
    retrato: process.argv.includes('--retrato') }))

  const perguntar = async (painel: DashboardRow, pergunta: string, conversationId: string | null) => {
    const tokens = { total: 0 }
    const resultado = await withAiRequestCache(async () => answerBiQuestion({
      dashboard: painel, manifest: await manifestForDashboard(painel, !retrato), userId: randomUUID(),
      conversationId, isAdmin: false, message: pergunta, signal: AbortSignal.timeout(600_000),
      audit: {
        configuration: configuracao,
        takeRateLimit: async () => {},
        resolveConversation: async (_u, _d, id) => id ?? randomUUID(),
        previousTurns: async id => (memoria.get(id) ?? []).slice(-4),
        recordTurn: async turno => {
          tokens.total += turno.tokens
          memoria.set(turno.conversationId, [...(memoria.get(turno.conversationId) ?? []),
            { question: turno.question, answer: turno.answer.slice(0, 1200) }])
        },
        recordQueryLog: async entrada => { rastro.getStore()?.dax.push({ ms: entrada.durationMs, linhas: entrada.rowCount, status: entrada.status,
          consulta: entrada.dax.slice(0, 4000) }) },
      },
    }))
    return { resultado: resultado as Record<string, unknown>, tokens: tokens.total }
  }

  const resultados = await mapConcurrent(casos, Number(argumento('concorrencia') ?? 2), async caso => {
    const painel = paineis.get(caso.dashboardId)!
    const registro: Rastro = { chamadas: [], pendentes: [], dax: [] }
    let linhas: Record<string, unknown>[] = [], objeto: Record<string, unknown> = {}
    try { ({ linhas, objeto } = await oraculo(caso, await manifestoDe(painel))) }
    catch (erro) { return { ...caso, ok: false, erro: `oráculo: ${erro instanceof Error ? erro.message.slice(0, 300) : erro}` } }
    if (process.argv.includes('--so-oraculo')) {
      console.log(JSON.stringify({ id: caso.id, oraculo: linhas.slice(0, 6) }))
      return { ...caso, ok: true, oraculoLinhas: linhas.slice(0, 20) }
    }
    let conversa: string | null = null
    if (caso.anterior) {
      try { conversa = String((await perguntar(painel, caso.anterior, null)).resultado.conversationId) }
      catch (erro) { return { ...caso, ok: false, erro: `pergunta anterior: ${erro instanceof Error ? erro.message : erro}` } }
    }
    const inicio = performance.now()
    try {
      const { resultado, tokens } = await rastro.run(registro, () => perguntar(painel, caso.pergunta, conversa))
      const ms = performance.now() - inicio
      await Promise.allSettled(registro.pendentes)
      const nota = avaliar(caso, resultado, linhas, objeto)
      const ia = registro.chamadas.filter(c => c.tipo === 'ia')
      const soma = (tipo: Chamada['tipo']) => Math.round(registro.chamadas.filter(c => c.tipo === tipo).reduce((t, c) => t + c.ms, 0))
      const linha = { id: caso.id, ok: nota.ok, aproximado: nota.aproximado, s: Math.round(ms / 100) / 10, chamadasIa: ia.length,
        raciocinio: ia.reduce((t, c) => t + (c.raciocinioTokens ?? 0), 0) }
      console.log(JSON.stringify(linha))
      return { ...caso, ...nota, ms: Math.round(ms), tokens, resposta: resultado.answer ?? null, esclarecimento: resultado.clarification ?? null,
        oraculoLinhas: linhas.slice(0, 20), consultas: resultado.queries ?? [],
        tempos: { iaMs: soma('ia'), fabricMs: soma('fabric'), supabaseMs: soma('supabase'), daxMs: Math.round(registro.dax.reduce((t, d) => t + d.ms, 0)) },
        chamadas: registro.chamadas.map(c => ({ ...c, ms: Math.round(c.ms) })), dax: registro.dax }
    } catch (erro) {
      await Promise.allSettled(registro.pendentes)
      const ms = performance.now() - inicio
      console.log(JSON.stringify({ id: caso.id, ok: false, erro: erro instanceof Error ? erro.message.slice(0, 160) : String(erro), s: Math.round(ms / 100) / 10 }))
      return { ...caso, ok: false, ms: Math.round(ms), erro: erro instanceof Error ? erro.message : String(erro),
        chamadas: registro.chamadas.map(c => ({ ...c, ms: Math.round(c.ms) })), dax: registro.dax }
    }
  })

  const grupos = new Map<string, typeof resultados>()
  for (const r of resultados) for (const chave of [`painel:${paineis.get(r.dashboardId)?.name}`, `categoria:${r.categoria}`, 'total']) {
    grupos.set(chave, [...(grupos.get(chave) ?? []), r])
  }
  const resumo = Object.fromEntries([...grupos].map(([chave, rs]) => {
    const tempos = rs.flatMap(r => 'ms' in r && typeof r.ms === 'number' ? [r.ms] : [])
    return [chave, { casos: rs.length, acertos: rs.filter(r => r.ok).length, aproximados: rs.filter(r => 'aproximado' in r && r.aproximado).length,
      erros: rs.filter(r => 'erro' in r && r.erro).length, medianaS: (percentil(tempos, 50) ?? 0) / 1000, p90S: (percentil(tempos, 90) ?? 0) / 1000 }]
  }))
  await writeFile(resolve(saida), JSON.stringify({ quando: new Date().toISOString(), provedor: configuracao.provedorId,
    modelo: configuracao.modelo, raciocinio: configuracao.reasoningEffort, resumo, resultados }, null, 2))
  console.log(JSON.stringify(resumo, null, 2))
}

main().catch(erro => { console.error(erro instanceof Error ? erro.stack ?? erro.message : erro); process.exitCode = 1 })
