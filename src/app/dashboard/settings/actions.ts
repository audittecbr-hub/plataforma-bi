'use server'

import { createClient } from "@/utils/supabase/server"

export async function updatePassword(oldPassword: string, newPassword: string) {
    try {
        const supabase = await createClient()

        // 1. Verify old password by trying to sign in (re-authentication)
        // Since we can't get the user's email directly from session to sign in without being logged out if we use signInWithPassword
        // A better approach in Supabase is usually just to do updateUser if the user is logged in.
        // However, it's good practice to verify the old password.
        // But Supabase Auth API doesn't have a "verifyPassword" endpoint without signing in.
        // Signing in again replaces the session. 
        
        // Let's get the current user first.
        const { data: { user } , error: userError } = await supabase.auth.getUser()
        
        if (userError || !user || !user.email) {
            return { success: false, error: 'Usuário não autenticado.' }
        }

        // Attempt re-auth
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: oldPassword
        })

        if (signInError) {
            return { success: false, error: 'A senha atual está incorreta.' }
        }

        // 2. Update password
        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        })

        if (updateError) {
            return { success: false, error: 'Falha ao atualizar senha: ' + updateError.message }
        }

        return { success: true }

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        return { success: false, error: 'Erro inesperado: ' + message }
    }
}
