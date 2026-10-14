import 'server-only'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createAdminClient } from '@/utils/supabase/admin'
import { inBackground } from './background'

/**
 * Persistent, private storage for what the Chat IA can safely reuse:
 * the published model snapshot (definitions + catalog) and answers keyed by refresh.
 * Supabase Storage needs no migration. Any failure degrades to the live path.
 */
const BUCKET = 'bi-ai-cache'
let bucketReady: Promise<boolean> | null = null

function enabled(): boolean {
  return process.env.BI_AI_PERSISTENT_CACHE !== 'off' && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

/** QA runs write to their own namespace so they never feed production answers. */
function namespace(): string {
  return (process.env.BI_AI_CACHE_NAMESPACE || 'prod').replace(/[^a-z0-9-]/gi, '') || 'prod'
}

async function ensureBucket(): Promise<boolean> {
  bucketReady ??= (async () => {
    const storage = createAdminClient().storage
    const { data } = await storage.getBucket(BUCKET)
    if (data) return true
    const { error } = await storage.createBucket(BUCKET, { public: false })
    if (error && !/already exists|duplicate/i.test(error.message)) throw error
    return true
  })().catch((error) => {
    console.error('[bi-ai] cache bucket:', error instanceof Error ? error.message : error)
    bucketReady = null
    return false
  })
  return bucketReady
}

export interface Stored<T> { value: T; savedAt: number }

export async function readStored<T>(path: string): Promise<Stored<T> | null> {
  if (!enabled()) return null
  try {
    const { data, error } = await createAdminClient().storage.from(BUCKET).download(`${namespace()}/${path}`)
    if (error || !data) return null
    const parsed = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString('utf8')) as Stored<T>
    return parsed && typeof parsed.savedAt === 'number' ? parsed : null
  } catch (error) {
    console.error('[bi-ai] cache read:', path, error instanceof Error ? error.message : error)
    return null
  }
}

export async function writeStored(path: string, value: unknown): Promise<void> {
  if (!enabled() || !(await ensureBucket())) return
  const body = gzipSync(Buffer.from(JSON.stringify({ savedAt: Date.now(), value })))
  const { error } = await createAdminClient().storage.from(BUCKET)
    .upload(`${namespace()}/${path}`, body, { upsert: true, contentType: 'application/gzip' })
  if (error) console.error('[bi-ai] cache write:', path, error.message)
}

const FRESH_MS = 15 * 60_000
const MAX_AGE_MS = 24 * 60 * 60_000

/**
 * Stale-while-revalidate for published metadata: a stored snapshot answers at once;
 * one older than 15 minutes is refreshed after the response, and nothing older than
 * a day is ever served. A snapshot only exists after a successful live read.
 */
export async function snapshotOrLive<T>(path: string, loadLive: () => Promise<T>,
  onRevalidated?: (value: T) => void): Promise<T> {
  const stored = await readStored<T>(path)
  const age = stored ? Date.now() - stored.savedAt : Number.POSITIVE_INFINITY
  if (stored && age < MAX_AGE_MS) {
    if (age > FRESH_MS) inBackground(async () => {
      const value = await loadLive()
      await writeStored(path, value)
      onRevalidated?.(value)
    })
    return stored.value
  }
  const value = await loadLive()
  inBackground(() => writeStored(path, value))
  return value
}

/** Forced live read (admin resync or explicit freshness) that also refreshes the snapshot. */
export async function liveAndStore<T>(path: string, loadLive: () => Promise<T>): Promise<T> {
  const value = await loadLive()
  inBackground(() => writeStored(path, value))
  return value
}
