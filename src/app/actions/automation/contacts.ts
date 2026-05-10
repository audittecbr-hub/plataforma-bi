'use server'

import { createAdminClient } from "@/utils/supabase/admin"
import { revalidatePath } from "next/cache"
import { AutomationContact } from "./types"

export async function getContacts(): Promise<{ success: boolean; contacts?: AutomationContact[]; error?: string }> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('automation_contacts')
      .select('*')
      .order('name', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, contacts: data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function manageContact(formData: FormData) {
  const supabase = createAdminClient()
  
  const id = formData.get('id') as string | null
  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const email = formData.get('email') as string
  const department = formData.get('department') as string
  const active = formData.get('active') === 'on' // Switch component sends 'on' when checked
  const actionType = formData.get('actionType') as string

  if (actionType === 'delete' && id) {
    // Primeiro remove associações deste contato em agendamentos
    await supabase.from('automation_recipients').delete().eq('contact_id', id)

    const { error } = await supabase.from('automation_contacts').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/admin')
    return { success: true }
  }

  if (!name) return { success: false, error: 'Nome é obrigatório' }

  try {
    const payload = { 
        name, 
        phone: phone || null, 
        email: email || null,
        department: department || null,
        active 
    }

    if (id) {
        const { error } = await supabase.from('automation_contacts').update(payload).eq('id', id)
        if (error) return { success: false, error: error.message }
    } else {
        const { error } = await supabase.from('automation_contacts').insert(payload)
        if (error) return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/admin')
    return { success: true }

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteContact(id: string) {
    const supabase = createAdminClient()

    // Primeiro remove associações deste contato em agendamentos
    await supabase.from('automation_recipients').delete().eq('contact_id', id)

    const { error } = await supabase.from('automation_contacts').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/admin')
    return { success: true }
}
