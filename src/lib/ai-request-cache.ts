import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

const requests = new AsyncLocalStorage<Map<string, Promise<unknown>>>()

/** A fresh snapshot for each HTTP request; credentials never outlive its scope. */
export function withAiRequestCache<T>(work: () => Promise<T>): Promise<T> {
  return requests.run(new Map(), work)
}

export function memoAiRequest<T>(key: string, read: () => Promise<T>): Promise<T> {
  const cache = requests.getStore()
  if (!cache) return read()
  const existing = cache.get(key)
  if (existing) return existing as Promise<T>
  const pending = Promise.resolve().then(read)
  cache.set(key, pending)
  void pending.catch(() => { if (cache.get(key) === pending) cache.delete(key) })
  return pending
}

export function invalidateAiRequest(key: string): void {
  requests.getStore()?.delete(key)
}
