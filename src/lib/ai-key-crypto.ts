import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface EncryptedApiKey {
  encrypted_api_key: string
  key_iv: string
  key_tag: string
}

export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw?.trim()) return null
  const encoded = raw.trim()
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error('BI_AI_ENCRYPTION_KEY deve ser Base64 de 32 bytes.')
  }
  return key
}

export function encryptApiKey(providerId: string, secret: string, key: Buffer): EncryptedApiKey {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(providerId))
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return { encrypted_api_key: encrypted.toString('base64'),
    key_iv: iv.toString('base64'), key_tag: cipher.getAuthTag().toString('base64') }
}

export function decryptApiKey(providerId: string, data: EncryptedApiKey, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(data.key_iv, 'base64'))
  decipher.setAAD(Buffer.from(providerId))
  decipher.setAuthTag(Buffer.from(data.key_tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data.encrypted_api_key, 'base64')), decipher.final()]).toString('utf8')
}
