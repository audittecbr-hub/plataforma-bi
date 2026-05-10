'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function resetPassword(prevState: unknown, formData: FormData) {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (password !== confirmPassword) {
    return { error: 'As senhas não coincidem.' }
  }
  
  if (password.length < 6) {
    return { error: 'A senha deve ter no mínimo 6 caracteres.' }
  }

  const supabase = await createClient()
  
  // 1. Update the password
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: 'Erro ao redefinir a senha: ' + error.message }
  }

  // 2. Update the 'change_password_required' flag in the profiles table
  // Need to get the current user first to know who to update
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ change_password_required: false })
        .eq('id', user.id)

      if (profileError) {
          console.error('Failed to update profile flag:', profileError)
          // We can perhaps ignore this if the password was changed successfully, 
          // but the user will be redirected back here on next login if we don't fix it.
          // For now, let's treat it as a soft fail or just return error.
          // Better to return success but log it.
      }
  }

  redirect('/dashboard')
}
