import assert from 'node:assert/strict'
import test from 'node:test'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { selectContext } from '../src/lib/bi-ai/context'
import { certifiedDimensions, certifiedMeasures, certifiedOnly } from '../src/lib/bi-ai/ia-table'

const manifest = parseManifest({ schemaVersion: '2.0', identity: {
  workspaceId: '11111111-1111-4111-8111-111111111111', semanticModelId: '22222222-2222-4222-8222-222222222222',
}, business: {}, report: {}, model: {
  tables: [
    { name: 'ciclo_etapas', columns: [{ name: 'HONORARIO', dataType: 'decimal' }, { name: 'JOB', dataType: 'string' }] },
    { name: 'Calendario', columns: [{ name: 'Date', dataType: 'dateTime' }, { name: 'Ano', dataType: 'int64' }] },
    { name: 'IA Regional', columns: [{ name: 'Regional', dataType: 'string' }] },
    { name: 'IA Job', columns: [{ name: 'Job', dataType: 'string' }] },
    { name: 'IA', columns: [] },
  ],
  measures: [
    { name: 'Honorários Encontrados', table: 'IA', description: 'Certificada. Recortes por IA Regional e IA Job.' },
    { name: 'Total Aprovado', table: 'IA', description: 'Certificada.' },
    { name: 'Honorário ciclo', table: 'ciclo_etapas', description: 'Medida técnica auxiliar.' },
  ],
} })

test('a tabela IA é reconhecida com suas dimensões e o calendário', () => {
  assert.deepEqual(certifiedMeasures(manifest).map(m => m.name), ['Honorários Encontrados', 'Total Aprovado'])
  assert.deepEqual(certifiedDimensions(manifest).map(c => `${c.table}[${c.name}]`).sort(),
    ['Calendario[Ano]', 'Calendario[Date]', 'IA Job[Job]', 'IA Regional[Regional]'])
})

test('o contexto sempre leva todas as medidas certificadas na frente, mesmo sem palavra em comum com a pergunta', () => {
  const context = selectContext(manifest, 'qual o melhor resultado do ano?', false)
  assert.deepEqual(context.measures.slice(0, 2).map(m => m.name), ['Honorários Encontrados', 'Total Aprovado'])
  assert(context.columns.some(c => c.table === 'IA Regional'))
})

test('dimensões do modelo citadas na descrição da tabela IA também recortam as medidas certificadas', () => {
  const evolutivo = parseManifest({ schemaVersion: '2.0', identity: {
    workspaceId: '11111111-1111-4111-8111-111111111111', semanticModelId: '22222222-2222-4222-8222-222222222222',
  }, business: {}, report: {}, model: {
    tables: [
      { name: 'Metas', columns: [{ name: 'valor', dataType: 'decimal' }] },
      { name: 'Dim_Operacao_PxR', columns: [{ name: 'Operacao', dataType: 'string' }] },
      { name: 'Calendario', columns: [{ name: 'Date', dataType: 'dateTime' }] },
      { name: 'IA', description: "Medidas certificadas. Recortes por 'Dim_Operacao_PxR' e pelo Calendario.", columns: [] },
    ],
    measures: [{ name: 'Receita Realizada', table: 'IA', description: 'Certificada.' }],
  } })
  assert(certifiedDimensions(evolutivo).some(c => c.table === 'Dim_Operacao_PxR'))
  assert.equal(certifiedOnly(`EVALUATE SUMMARIZECOLUMNS(Dim_Operacao_PxR[Operacao], "v", [Receita Realizada])`, evolutivo), true)
  assert.equal(certifiedOnly(`EVALUATE ROW("v", CALCULATE([Receita Realizada], Metas[valor] > 0))`, evolutivo), false)
})

test('só dispensa a revisão quando o plano lê medidas certificadas recortadas por dimensões IA e calendário', () => {
  assert.equal(certifiedOnly(`EVALUATE TOPN(1, SUMMARIZECOLUMNS('IA Job'[Job], FILTER(ALL(Calendario[Date]), Calendario[Date] >= DATE(2026,9,1)),
    "Honorários Encontrados", [Honorários Encontrados]), [Honorários Encontrados], DESC)`, manifest), true)
  assert.equal(certifiedOnly(`EVALUATE ROW("x", IA[Total Aprovado])`, manifest), true)
  // Regra reconstruída com coluna da base: continua revisada.
  assert.equal(certifiedOnly(`EVALUATE SUMMARIZECOLUMNS('IA Job'[Job], "h", SUM(ciclo_etapas[HONORARIO]), "e", [Honorários Encontrados])`, manifest), false)
  // Medida técnica antiga misturada: continua revisada.
  assert.equal(certifiedOnly(`EVALUATE ROW("a", [Honorário ciclo], "b", [Total Aprovado])`, manifest), false)
  // Nomes dentro de texto não contam.
  assert.equal(certifiedOnly(`EVALUATE ROW("[Honorários Encontrados]", 1)`, manifest), false)
})
