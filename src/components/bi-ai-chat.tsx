'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, History, LoaderCircle, MessageSquareText, Plus, Send, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface ChatContext {
  enabled: boolean
  dashboardName: string
  reason?: string | null
  recommendedQuestions: string[]
}

interface Message {
  id: string
  question: string
  answer?: string
  error?: string
  queries?: { purpose: string; rowCount: number }[]
  clarification?: ClarificationResponse
}

interface ClarificationResponse { question: string; options: string[]; token: string }

interface ConversationSummary { id: string; updated_at: string }

export function BiAiChat({ dashboardId, dashboardName }: { dashboardId: string; dashboardName: string }) {
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<ChatContext | null>(null)
  const [contextError, setContextError] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [pendingClarification, setPendingClarification] = useState<ClarificationResponse | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [pending, setPending] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/bi-ai/history?dashboardId=${encodeURIComponent(dashboardId)}`, { signal })
    if (!response.ok) return
    const body = await response.json() as { conversations?: ConversationSummary[] }
    setConversations(body.conversations ?? [])
  }, [dashboardId])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/bi-ai/context?dashboardId=${encodeURIComponent(dashboardId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Não foi possível carregar o Chat IA.')
        setContext(body as ChatContext)
      })
      .catch((error) => { if (!controller.signal.aborted) setContextError(error.message) })
    loadConversations(controller.signal).catch(() => {})
    return () => { controller.abort(); activeRequest.current?.abort() }
  }, [dashboardId, loadConversations])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function openConversation(id: string) {
    activeRequest.current?.abort()
    setPending(false)
    const response = await fetch(`/api/bi-ai/history?dashboardId=${encodeURIComponent(dashboardId)}&conversationId=${encodeURIComponent(id)}`)
    const body = await response.json()
    if (!response.ok) { setContextError(body.error ?? 'Não foi possível abrir a conversa.'); return }
    setConversationId(id)
    setPendingClarification(null)
    setMessages((body.messages ?? []).map((row: { id: number; question: string; answer: string }) => ({
      id: String(row.id), question: row.question, answer: row.answer,
    })))
    setShowHistory(false)
  }

  function newConversation() {
    activeRequest.current?.abort()
    setPending(false)
    setConversationId(null)
    setPendingClarification(null)
    setMessages([])
    setMessage('')
    setShowHistory(false)
  }

  async function send(text: string) {
    const question = text.trim()
    if (!question || pending || !context?.enabled) return
    const controller = new AbortController()
    const clarificationToken = pendingClarification?.token
    activeRequest.current = controller
    const id = crypto.randomUUID()
    setMessage('')
    setPending(true)
    setMessages((old) => [...old, { id, question }])
    try {
      const response = await fetch('/api/bi-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId, conversationId, message: question,
          ...(clarificationToken ? { clarificationToken } : {}) }),
        signal: controller.signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Não consegui responder agora.')
      setConversationId(body.conversationId)
      const clarification = body.clarification as ClarificationResponse | undefined
      setPendingClarification(clarification ?? null)
      setMessages((old) => old.map((item) => item.id === id
        ? { ...item, answer: clarification?.question ?? body.answer,
          clarification, queries: body.queries } : item))
      if (!clarification) loadConversations().catch(() => {})
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((old) => old.map((item) => item.id === id ? { ...item, error: 'Pergunta cancelada.' } : item))
      } else {
        setMessages((old) => old.map((item) => item.id === id
          ? { ...item, error: error instanceof Error ? error.message : 'Falha ao responder.' } : item))
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="subtle" size="sm" onClick={() => setOpen(true)}>
        <MessageSquareText className="size-4" /> Perguntar à IA
      </Button>
      <DialogContent className="!left-auto !right-0 !top-0 !h-dvh !w-full !max-w-none !translate-x-0 !translate-y-0 !gap-0 !rounded-none !p-0 sm:!max-w-[440px] sm:!rounded-l-xl" showCloseButton={false}>
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base"><Bot className="size-4 text-gold-text" /> Perguntar à IA</DialogTitle>
              <DialogDescription className="truncate">Contexto: {dashboardName}</DialogDescription>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Histórico" onClick={() => setShowHistory((old) => !old)}><History /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Nova conversa" onClick={newConversation}><Plus /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar chat" onClick={() => setOpen(false)}><X /></Button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {showHistory ? (
              <div className="space-y-2">
                <p className="eyebrow text-[10px] text-faint">Conversas deste relatório</p>
                {conversations.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há conversas.</p>}
                {conversations.map((conversation) => (
                  <button key={conversation.id} type="button" onClick={() => openConversation(conversation.id)}
                    className="block w-full rounded-[4px] border p-3 text-left text-sm hover:bg-accent">
                    Conversa de {new Date(conversation.updated_at).toLocaleString('pt-BR')}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {!context && !contextError && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Carregando contexto…</p>}
                {(contextError || (context && !context.enabled)) && (
                  <div className="rounded-[8px] border bg-surface p-3 text-sm text-muted-foreground">
                    {contextError || context?.reason || 'IA não configurada para este relatório.'}
                  </div>
                )}
                {context?.enabled && messages.length === 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Os números vêm do modelo Power BI deste relatório. Informe na pergunta os filtros desejados; o chat não lê os filtros do iframe.</p>
                    {context.recommendedQuestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => send(suggestion)}
                        className="block w-full rounded-[4px] border px-3 py-2 text-left text-sm hover:border-gold hover:bg-gold-wash">
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="ml-auto max-w-[90%] rounded-[8px] bg-gold-wash px-3 py-2 text-sm text-foreground">{item.question}</div>
                    {item.answer && <div className="rounded-[8px] border bg-surface px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                      {item.answer}
                      {!!item.queries?.length && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{item.queries.length} consulta(s) ao Power BI</p>}
                      {item.clarification && <div className="mt-3 flex flex-wrap gap-2" aria-label="Opções de esclarecimento">
                        {item.clarification.options.map((option) => <Button key={option} type="button"
                          variant="secondary" size="sm" onClick={() => send(option)}
                          disabled={pending || pendingClarification?.token !== item.clarification?.token}>{option}</Button>)}
                        <p className="w-full text-xs text-muted-foreground">Você também pode responder com suas próprias palavras abaixo.</p>
                      </div>}
                    </div>}
                    {item.error && <div className="rounded-[8px] border border-destructive/40 px-3 py-2 text-sm text-destructive">{item.error}</div>}
                    {!item.answer && !item.error && pending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Consultando o modelo e conferindo a resposta…</p>}
                  </div>
                ))}
                <div ref={bottom} />
              </div>
            )}
          </div>
          <div className="border-t p-4">
            <div className="flex items-end gap-2">
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} maxLength={500}
                placeholder={pendingClarification ? 'Responda ao esclarecimento acima…' : 'Pergunte sobre este relatório…'}
                disabled={!context?.enabled || pending}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(message) } }}
                className="max-h-28 resize-none" />
              {pending ? (
                <Button type="button" variant="secondary" size="icon" aria-label="Cancelar" onClick={() => activeRequest.current?.abort()}><Square /></Button>
              ) : (
                <Button type="button" size="icon" aria-label="Enviar" disabled={!context?.enabled || !message.trim()} onClick={() => send(message)}><Send /></Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-faint">O contexto muda automaticamente ao selecionar outro relatório.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
