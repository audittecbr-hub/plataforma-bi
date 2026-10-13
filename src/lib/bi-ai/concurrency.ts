/** Run independent reads with a bounded pool and preserve their original order. */
export async function mapConcurrent<T, R>(items: T[], concurrency: number,
  work: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Concorrência inválida.')
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      try {
        signal?.throwIfAborted()
        results[index] = { status: 'fulfilled', value: await work(items[index], index) }
      } catch (reason) { results[index] = { status: 'rejected', reason } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results.map(result => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
}
