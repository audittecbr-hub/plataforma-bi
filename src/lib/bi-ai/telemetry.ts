import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

/** One AI step as it was paid for: model time, tokens and why it stopped. */
export interface BiTelemetryStage {
  etapa: string
  ms: number
  tokens?: number
  motivo?: string | null
  esforco?: string
}

export interface BiTelemetry {
  inicio: number
  etapas: BiTelemetryStage[]
  daxMs: number
  daxConsultas: number
  metadadosMs: number
  cache: 'resposta' | null
}

const store = new AsyncLocalStorage<BiTelemetry>()

/** Reuses the surrounding collector so continuations inside one request add up. */
export function withBiTelemetry<T>(work: () => Promise<T>): Promise<T> {
  if (store.getStore()) return work()
  return store.run({ inicio: Date.now(), etapas: [], daxMs: 0, daxConsultas: 0, metadadosMs: 0, cache: null }, work)
}

export function recordStage(stage: BiTelemetryStage): void {
  store.getStore()?.etapas.push({ ...stage, ms: Math.round(stage.ms) })
}

export function recordDax(ms: number): void {
  const current = store.getStore()
  if (!current) return
  current.daxMs += Math.round(ms)
  current.daxConsultas++
}

export function recordMetadata(ms: number): void {
  const current = store.getStore()
  if (current) current.metadadosMs += Math.round(ms)
}

export function markCached(): void {
  const current = store.getStore()
  if (current) current.cache = 'resposta'
}

/** What is stored with the turn (gs_chat_log.conferencia) for the AI health panel. */
export function telemetrySnapshot(): (BiTelemetry & { totalMs: number; iaMs: number }) | undefined {
  const current = store.getStore()
  if (!current) return undefined
  return { ...current, etapas: [...current.etapas], totalMs: Date.now() - current.inicio,
    iaMs: current.etapas.reduce((total, stage) => total + stage.ms, 0) }
}
