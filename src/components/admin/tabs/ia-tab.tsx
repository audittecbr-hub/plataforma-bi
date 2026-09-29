'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bot, CheckCircle2, CircleAlert, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, TestTube2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { reasoningOptions, type ReasoningEffort } from '@/lib/ai-reasoning'
import {
  deleteAiProviderKey, getAiAdminState, listAiModels, saveAiGlobal, saveAiProviderKey,
  testAiModel, toggleAiModel, toggleAiProvider, toggleDashboardAi,
} from '@/app/dashboard/admin/ai-actions'

type Snapshot = Awaited<ReturnType<typeof getAiAdminState>>
type Provider = Snapshot['providers'][number]
type Model = { id: string; disponivel: boolean; supported: boolean; enabled: boolean; protocol: string; free: boolean }

const EFFORT_LABEL: Record<ReasoningEffort, string> = {
  auto: 'Automático do modelo', none: 'Sem raciocínio extra', low: 'Baixo',
  medium: 'Médio', high: 'Alto', max: 'Máximo',
}

export function IaTab({ initial }: { initial: Snapshot }) {
  const router = useRouter()
  const [providers, setProviders] = useState(initial.providers)
  const [dashboards, setDashboards] = useState(initial.dashboards)
  const [enabled, setEnabled] = useState(initial.config.enabled)
  const [providerId, setProviderId] = useState(initial.config.provedorId)
  const [model, setModel] = useState(initial.config.modelo)
  const [effort, setEffort] = useState<ReasoningEffort>(initial.config.reasoningEffort)
  const [plannerTokens, setPlannerTokens] = useState(initial.config.plannerMaxTokens)
  const [answerTokens, setAnswerTokens] = useState(initial.config.answerMaxTokens)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [models, setModels] = useState<Model[]>([])
  const [modelsError, setModelsError] = useState('')
  const [busy, setBusy] = useState('')
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [testResult, setTestResult] = useState('')

  const selectedProvider = providers.find((item) => item.id === providerId)
  const effortChoices = reasoningOptions(providerId, model)
  const visibleDashboards = useMemo(() => dashboards.filter((dashboard) =>
    dashboard.name.toLocaleLowerCase('pt-BR').includes(dashboardSearch.toLocaleLowerCase('pt-BR'))),
  [dashboards, dashboardSearch])

  async function run(label: string, work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(label)
    try {
      const result = await work()
      if (!result.ok) { toast.error(result.error ?? 'Operação não concluída.'); return false }
      toast.success(success)
      router.refresh()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao atualizar a IA.')
      return false
    } finally { setBusy('') }
  }

  async function loadModels() {
    setBusy('models')
    setModelsError('')
    try {
      const result = await listAiModels(providerId)
      if (result.ok) setModels(result.modelos)
      else { setModels([]); setModelsError(result.erro ?? 'A listagem falhou. Você pode informar o ID do modelo manualmente.') }
    } catch (error) {
      setModels([])
      setModelsError(error instanceof Error ? error.message : 'A listagem falhou.')
    } finally { setBusy('') }
  }

  async function saveGlobal() {
    const result = await run('global', () => saveAiGlobal({ enabled, providerId, model,
      reasoningEffort: effort, plannerMaxTokens: plannerTokens, answerMaxTokens: answerTokens }),
    'Configuração do Chat IA salva.')
    if (result) setTestResult('')
  }

  async function saveKey(item: Provider) {
    const value = keyInputs[item.id]?.trim()
    if (!value) { toast.error('Informe a chave de API.'); return }
    const saved = await run(`key-${item.id}`, () => saveAiProviderKey(item.id, value), `Chave de ${item.name} salva.`)
    if (saved) {
      setKeyInputs((old) => ({ ...old, [item.id]: '' }))
      setProviders((old) => old.map((entry) => entry.id === item.id ? { ...entry, hasStoredKey: true } : entry))
    }
  }

  async function removeKey(item: Provider) {
    const removed = await run(`key-${item.id}`, () => deleteAiProviderKey(item.id), `Chave armazenada de ${item.name} removida.`)
    if (removed) setProviders((old) => old.map((entry) => entry.id === item.id ? { ...entry, hasStoredKey: false } : entry))
  }

  async function changeProvider(item: Provider, next: boolean) {
    const saved = await run(`provider-${item.id}`, () => toggleAiProvider(item.id, next),
      `${item.name} ${next ? 'ativado' : 'desativado'}.`)
    if (saved) setProviders((old) => old.map((entry) => entry.id === item.id ? { ...entry, enabled: next } : entry))
  }

  async function changeModel(id: string, next: boolean) {
    const saved = await run(`model-${id}`, () => toggleAiModel(providerId, id, next),
      `Modelo ${id} ${next ? 'ativado' : 'desativado'}.`)
    if (saved) {
      setProviders((old) => old.map((entry) => entry.id !== providerId ? entry : {
        ...entry, disabledModels: next ? entry.disabledModels.filter((name) => name !== id)
          : [...entry.disabledModels, id],
      }))
      setModels((old) => old.map((entry) => entry.id === id ? { ...entry, enabled: next, disponivel: entry.supported && next } : entry))
    }
  }

  async function changeDashboard(id: string, next: boolean) {
    const saved = await run(`dashboard-${id}`, () => toggleDashboardAi(id, next),
      `IA ${next ? 'ativada' : 'desativada'} para o dashboard.`)
    if (saved) setDashboards((old) => old.map((item) => item.id === id ? { ...item, enabled: next } : item))
  }

  async function testModel() {
    setBusy('test')
    setTestResult('')
    try {
      const result = await testAiModel(providerId, model, effort)
      const message = result.ok ? `Conexão validada com ${result.model} em ${result.durationMs} ms.`
        : result.error ?? 'Teste não concluído.'
      setTestResult(message)
      if (result.ok) toast.success(message)
      else toast.error(message)
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : 'Teste não concluído.')
    } finally { setBusy('') }
  }

  async function diagnoseDashboard(id: string) {
    setBusy(`diagnostic-${id}`)
    try {
      const response = await fetch(`/api/bi-ai/diagnostic?dashboardId=${encodeURIComponent(id)}`)
      const result = await response.json() as { ok?: boolean; code?: string; detail?: string; error?: string }
      const message = result.detail ?? result.error ?? 'Falha no diagnóstico.'
      if (response.ok && result.ok) toast.success(message)
      else toast.error(`${result.code ?? 'POWERBI_ERROR'}: ${message}`)
    } catch { toast.error('Falha ao consultar o diagnóstico.') }
    finally { setBusy('') }
  }

  return <div className="space-y-6">
    {!initial.migrationReady && <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <p>A configuração da IA ainda precisa da migration <strong>20260928_ia_admin_settings.sql</strong> e da migration anterior do Chat IA no Supabase.</p>
    </div>}

    <Panel>
      <PanelHeader icon={Bot} eyebrow="Configuração global" title="Chat IA do portal"
        description="Escolha o provedor e o modelo usados para interpretar perguntas e explicar os números consultados no Power BI." />
      <div className="grid gap-5 border-t px-5 py-5 md:grid-cols-2 md:px-6">
        <div className="flex items-center justify-between gap-4 rounded-[8px] border bg-surface p-4 md:col-span-2">
          <div><p className="font-semibold">Chat IA ativo</p><p className="text-xs text-muted-foreground">Após salvar, desligar interrompe novas perguntas em todos os dashboards.</p></div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Ativar Chat IA" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-provider">Provedor em uso</Label>
          <Select value={providerId} onValueChange={(id) => { setProviderId(id); setModel(providers.find((item) => item.id === id)?.modelDefault ?? ''); setEffort('auto'); setModels([]); setModelsError('') }}>
            <SelectTrigger id="ai-provider"><SelectValue /></SelectTrigger>
            <SelectContent>{providers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Origem atual: {initial.config.fonte === 'banco' ? 'painel administrativo' : 'ambiente do servidor'}.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-model">Modelo em uso</Label>
          <Input id="ai-model" value={model} onChange={(event) => { setModel(event.target.value); setEffort('auto') }} maxLength={160} placeholder="ID exato do modelo" />
          <p className="text-xs text-muted-foreground">Informe um ID da lista abaixo ou digite o ID oficial do provedor.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-effort">Nível de raciocínio</Label>
          <Select value={effortChoices.includes(effort) ? effort : 'auto'} onValueChange={(value) => setEffort(value as ReasoningEffort)}>
            <SelectTrigger id="ai-effort"><SelectValue /></SelectTrigger>
            <SelectContent>{effortChoices.map((value) => <SelectItem key={value} value={value}>{EFFORT_LABEL[value]}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">As opções dependem da API e do modelo. Automático usa o padrão do provedor.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="ai-plan-tokens">Tokens do plano</Label><Input id="ai-plan-tokens" type="number" min={1000} max={12000} value={plannerTokens} onChange={(event) => setPlannerTokens(Number(event.target.value))} /></div>
          <div className="space-y-2"><Label htmlFor="ai-answer-tokens">Tokens da resposta</Label><Input id="ai-answer-tokens" type="number" min={500} max={8000} value={answerTokens} onChange={(event) => setAnswerTokens(Number(event.target.value))} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <Button type="button" onClick={saveGlobal} disabled={!!busy || !initial.migrationReady}>{busy === 'global' && <LoaderCircle className="size-4 animate-spin" />}Salvar configuração</Button>
          <Button type="button" variant="secondary" onClick={testModel} disabled={!!busy || !model || !selectedProvider?.endpointConfigured}><TestTube2 /> Testar provedor e modelo</Button>
          {testResult && <p className="text-xs text-muted-foreground">{testResult}</p>}
        </div>
      </div>
    </Panel>

    <Panel>
      <PanelHeader icon={KeyRound} eyebrow="Credenciais" title="Provedores e chaves de API"
        description="As chaves salvas aqui são cifradas no servidor. O valor nunca volta para esta página." />
      <div className="border-t px-5 py-5 md:px-6">
        {!initial.encryptionConfigured && <p className="mb-5 rounded-[8px] border bg-surface p-3 text-sm text-muted-foreground">Para salvar chaves pela interface, configure <code>BI_AI_ENCRYPTION_KEY</code> no servidor (Base64 de 32 bytes). Chaves já definidas no ambiente continuam utilizáveis.</p>}
        <div className="grid gap-4 xl:grid-cols-2">
          {providers.map((item) => <div key={item.id} className="space-y-3 rounded-[8px] border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><h3 className="font-semibold">{item.name}</h3><p className="text-xs text-muted-foreground">{item.id === 'opencode-go' ? 'Chat Completions · Messages · Responses' : item.format === 'anthropic-messages' ? 'Anthropic Messages' : 'Chat Completions'}</p></div>
              <Switch checked={item.enabled} onCheckedChange={(next) => changeProvider(item, next)} disabled={!!busy || !initial.migrationReady} aria-label={`Ativar ${item.name}`} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={item.enabled ? 'success' : 'outline'}>{item.enabled ? 'Ativo' : 'Desativado'}</Badge>
              <Badge variant={item.hasStoredKey || item.hasEnvironmentKey ? 'success' : 'warning'}>{item.hasStoredKey ? 'Chave cifrada no banco' : item.hasEnvironmentKey ? 'Chave no ambiente' : 'Sem chave'}</Badge>
              {!item.endpointConfigured && <Badge variant="warning">Endpoint pendente</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Ambiente: {item.envNames.join(' ou ')}{item.id === 'compatible' && ' · URL: BI_AI_BASE_URL'}.</p>
            <div className="flex flex-col gap-2 sm:flex-row"><PasswordInput value={keyInputs[item.id] ?? ''} onChange={(event) => setKeyInputs((old) => ({ ...old, [item.id]: event.target.value }))} autoComplete="new-password" placeholder="Nova chave de API" aria-label={`Nova chave de ${item.name}`} />
              <Button type="button" size="sm" variant="secondary" onClick={() => saveKey(item)} disabled={!!busy || !initial.migrationReady || !initial.encryptionConfigured}>Salvar chave</Button></div>
            {item.hasStoredKey && <Button type="button" size="sm" variant="ghost" onClick={() => removeKey(item)} disabled={!!busy}>Remover chave armazenada</Button>}
          </div>)}
        </div>
      </div>
    </Panel>

    <Panel>
      <PanelHeader icon={RefreshCw} eyebrow="Catálogo" title="Modelos disponíveis"
        description="Consulte a lista atual do provedor selecionado, escolha o ID exato e controle quais modelos podem ser usados." actions={<Button type="button" variant="secondary" onClick={loadModels} disabled={!!busy || !selectedProvider?.endpointConfigured}><RefreshCw /> Atualizar lista</Button>} />
      <div className="space-y-3 border-t px-5 py-5 md:px-6">
        {modelsError && <p className="text-sm text-warning">{modelsError}</p>}
        {!models.length && !modelsError && <p className="text-sm text-muted-foreground">Selecione um provedor e clique em “Atualizar lista”. Modelos indisponíveis para o formato da integração não podem ser escolhidos.</p>}
        {models.length > 0 && <div className="max-h-96 divide-y overflow-y-auto rounded-[8px] border">
          {models.map((entry) => {
            const disabledByAdmin = selectedProvider?.disabledModels.includes(entry.id) ?? false
            const available = entry.supported
            return <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <button type="button" className="min-w-0 truncate text-left text-sm font-medium hover:text-gold-text" onClick={() => { setModel(entry.id); setEffort('auto') }} disabled={!available}>{entry.id} <span className="text-xs font-normal text-muted-foreground">· {entry.protocol}</span>{entry.free && <span className="ml-2 text-xs font-semibold text-gold-text">Gratuito</span>}</button>
              {available ? <Switch checked={!disabledByAdmin} onCheckedChange={(next) => changeModel(entry.id, next)} disabled={!!busy || !initial.migrationReady} aria-label={`Ativar modelo ${entry.id}`} />
                : <Badge variant="outline">Formato não atendido</Badge>}
            </div>
          })}
        </div>}
      </div>
    </Panel>

    <Panel>
      <PanelHeader icon={ShieldCheck} eyebrow="Por relatório" title="Chat IA nos dashboards"
        description="Ative relatórios vinculados ao Power BI. Sem manifesto, o catálogo é lido ao vivo do modelo e do Fabric." />
      <div className="space-y-3 border-t px-5 py-5 md:px-6">
        <Input type="search" value={dashboardSearch} onChange={(event) => setDashboardSearch(event.target.value)} placeholder="Buscar dashboard…" aria-label="Buscar dashboard" className="max-w-sm" />
        <div className="max-h-[32rem] divide-y overflow-y-auto rounded-[8px] border">
          {visibleDashboards.map((dashboard) => <div key={dashboard.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{dashboard.name}</p><p className="text-xs text-muted-foreground">{dashboard.manifestVersion ? `Manifesto ${dashboard.manifestVersion}` : dashboard.linked ? dashboard.workspaceLinked ? 'Catálogo ao vivo disponível para ativação' : 'Dataset vinculado; workspace pendente' : 'Sem vínculo Power BI'}{dashboard.syncedAt && ` · sincronizado ${new Date(dashboard.syncedAt).toLocaleDateString('pt-BR')}`}</p></div>
            <div className="flex items-center gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => diagnoseDashboard(dashboard.id)} disabled={!!busy || !dashboard.enabled || !dashboard.linked || !dashboard.workspaceLinked}>Diagnóstico</Button><Switch checked={dashboard.enabled} onCheckedChange={(next) => changeDashboard(dashboard.id, next)} disabled={!!busy || !initial.migrationReady || (!dashboard.linked || !dashboard.workspaceLinked) && !dashboard.enabled} aria-label={`Ativar IA para ${dashboard.name}`} /></div>
          </div>)}
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" /> Os IDs Power BI são resolvidos no servidor a partir do dashboard selecionado.</p>
      </div>
    </Panel>
  </div>
}
