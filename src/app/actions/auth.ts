'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

/**
 * Encerra a sessão. Vive num arquivo próprio para ser usado tanto pela
 * sidebar (server component) quanto pelo menu mobile e pela paleta de
 * comandos (client components).
 */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Limpa a preferência de sessão temporária ("manter-me conectado" desmarcado)
  const cookieStore = await cookies()
  cookieStore.delete('sb-session-only')

  redirect('/login')
}
