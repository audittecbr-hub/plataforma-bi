
'use server'

import { createAdminClient } from "@/utils/supabase/admin"
import { revalidatePath } from "next/cache"
import { AutomationTemplate } from "./types"

export async function getTemplates(): Promise<{ success: boolean; templates?: AutomationTemplate[]; error?: string }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('automation_templates').select('*').order('name', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, templates: data }
}

export async function manageTemplate(formData: FormData) {
  const supabase = createAdminClient()
  const id = formData.get('id') as string | null
  const name = formData.get('name') as string
  const content = formData.get('content') as string

  if (!name || !content) return { success: false, error: 'Nome e conteúdo são obrigatórios' }

  try {
    const payload = { name, content }
    
    if (id) {
        const { error } = await supabase.from('automation_templates').update(payload).eq('id', id)
        if (error) throw error
    } else {
        const { error } = await supabase.from('automation_templates').insert(payload)
        if (error) throw error
    }
    
    revalidatePath('/dashboard/admin')
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteTemplate(id: string) {
    const supabase = createAdminClient()
    const { error } = await supabase.from('automation_templates').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/admin')
    return { success: true }
}
