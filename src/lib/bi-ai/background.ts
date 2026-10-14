import 'server-only'
import { after } from 'next/server'

/**
 * Work that must not delay the answer (snapshot revalidation, cache writes).
 * Inside a request it runs after the response; elsewhere (QA tools) it runs detached.
 */
export function inBackground(work: () => Promise<unknown>): void {
  const run = () => work().catch((error) => console.error('[bi-ai] background:', error instanceof Error ? error.message : error))
  try { after(run) } catch { void run() }
}
