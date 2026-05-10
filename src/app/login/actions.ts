'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { cookies, headers } from 'next/headers'

// Helper function to log access events
async function logAccessEvent(email: string, eventType: 'login_success' | 'login_failed', userId?: string) {
  try {
    const supabaseAdmin = createAdminClient()
    const headersList = await headers()
    
    await supabaseAdmin.from('access_logs').insert({
      user_id: userId || null,
      email,
      event_type: eventType,
      ip_address: headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || null,
      user_agent: headersList.get('user-agent') || null,
    })
  } catch (e) {
    // Silently fail - don't block login if logging fails
    console.error('Failed to log access event:', e)
  }
}

export async function login(redirectTo: string | undefined, prevState: unknown, formData: FormData) {
  // Checkbox sends "on" if checked, null if unchecked.
  // We want: Checked -> Remember (Persistent) -> sessionOnly = false
  // Unchecked -> Don't Remember (Session) -> sessionOnly = true
  // Default HTML checkbox behavior: value is "on" or missing.
  const remember = formData.get('remember') === 'on'
  
  // If remember is true, sessionOnly is false. If remember is false, sessionOnly is true.
  const sessionOnly = !remember

  // IMPORTANT: Set/delete the session-only cookie BEFORE creating the Supabase client
  // This ensures the cookie state is correct when the client's setAll() is called
  const cookieStore = await cookies()
  if (sessionOnly) {
    // Session cookies (no maxAge) are deleted when the browser closes.
    // Explicitly set path to avoid issues with different routes.
    cookieStore.set('sb-session-only', 'true', { path: '/' })
  } else {
    // Remove session-only cookie to ensure persistent session.
    // Use the same path to ensure it matches.
    cookieStore.set('sb-session-only', 'false', { path: '/', maxAge: -1 })
  }

  // Now create the Supabase client - it will read the correct cookie state
  const supabase = await createClient({ sessionOnly })

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Log failed login attempt
    await logAccessEvent(email, 'login_failed')
    return { error: error.message }
  }

  // Log successful login
  await logAccessEvent(email, 'login_success', data.user?.id)

  revalidatePath('/dashboard', 'layout')
  redirect(redirectTo || '/dashboard')
}

export async function forgotPassword(prevState: unknown, formData: FormData) {
  const supabase = createAdminClient() // Use admin client to generate link
  const email = formData.get('email') as string
  
  // 1. Generate Recovery Link via Supabase Admin
  const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
          redirectTo: process.env.NEXT_PUBLIC_SITE_URL 
          ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/auth/reset-password`
          : `http://localhost:3000/auth/callback?next=/auth/reset-password`,
      }
  })

  if (error) {
    console.error("Generate Link Error:", error)
    return { error: 'Não foi possível processar a solicitação. Verifique o e-mail.' }
  }

  // 2. Send Custom Email via Resend
  const { sendEmail, getResetPasswordTemplate } = await import('@/lib/email');
  const emailResult = await sendEmail({
      to: email,
      subject: 'Recuperação de Senha - Portal Grupo Studio',
      html: getResetPasswordTemplate(data.properties.action_link)
  })

  if (!emailResult.success) {
      return { error: 'Falha ao enviar e-mail. Tente novamente.' }
  }

  return { success: 'E-mail de recuperação enviado! Verifique sua caixa de entrada.' }
}
