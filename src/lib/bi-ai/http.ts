import { BiAiError } from './access'

export async function readJsonBody(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const announced = Number(request.headers.get('content-length'))
  if (announced > maxBytes) throw new BiAiError(413, 'PAYLOAD_TOO_LARGE', 'Pedido grande demais.')
  const reader = request.body?.getReader()
  if (!reader) throw new BiAiError(400, 'EMPTY_BODY', 'Corpo vazio.')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) { await reader.cancel(); throw new BiAiError(413, 'PAYLOAD_TOO_LARGE', 'Pedido grande demais.') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not object')
    return body as Record<string, unknown>
  } catch { throw new BiAiError(400, 'INVALID_JSON', 'JSON inválido.') }
}
