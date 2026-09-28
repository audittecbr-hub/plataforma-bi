import { createHash, timingSafeEqual } from 'node:crypto'

export function validRegistrationSecret(received: string, expected: string): boolean {
  if (!received || !expected) return false
  const a = createHash('sha256').update(received).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
