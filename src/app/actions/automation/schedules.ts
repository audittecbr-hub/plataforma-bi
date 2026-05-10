
'use server'

import { createAdminClient } from "@/utils/supabase/admin"
import { revalidatePath } from "next/cache"
import { AutomationSchedule, AutomationDefinition } from "./types"

export async function getDefinitions(): Promise<{ success: boolean; definitions?: AutomationDefinition[]; error?: string }> {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('automation_definitions').select('*').order('name', { ascending: true })
    if (error) return { success: false, error: error.message }
    return { success: true, definitions: data }
}

export async function getSchedules(): Promise<{ success: boolean; schedules?: AutomationSchedule[]; error?: string }> {
    const supabase = createAdminClient()
    
    // Fetch schedules with definitions and recipients (nested)
    const { data: schedulesData, error: schedError } = await supabase
        .from('automation_schedules')
        .select(`
            *,
            definition:automation_definitions(*),
            automation_recipients (
                contact:automation_contacts(*)
            ),
            template:automation_templates(*)
        `)
        .order('created_at', { ascending: false })

    if (schedError) return { success: false, error: schedError.message }

    // Map the result to flatten the structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules = schedulesData.map((s: any) => {
        const flatRecipients = s.automation_recipients
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ?.map((r: any) => r.contact) // Extract contact object
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ?.filter((c: any) => c !== null) // Filter nulls if any
            || []

        return { 
            ...s, 
            recipients: flatRecipients,
            // Remove the raw join property
            automation_recipients: undefined 
        }
    })

    return { success: true, schedules }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function manageSchedule(data: any) {
    const supabase = createAdminClient()
    const { id, name, automation_definition_id, scheduled_time, days_of_week, active, recipient_ids, template_id } = data

    if (!name || !automation_definition_id || !scheduled_time) {
        return { success: false, error: 'Dados incompletos' }
    }

    try {
        let scheduleId = id
        
        const payload = {
            name,
            automation_definition_id,
            scheduled_time,
            days_of_week: days_of_week || [],
            active,
            template_id
        }

        if (id) {
            const { error } = await supabase.from('automation_schedules').update(payload).eq('id', id)
            if (error) throw error
        } else {
            const { data: newSched, error } = await supabase.from('automation_schedules').insert(payload).select().single()
            if (error) throw error
            scheduleId = newSched.id
        }

        // Handle Recipients (Replace all)
        if (scheduleId) {
            // Delete existing
            await supabase.from('automation_recipients').delete().eq('schedule_id', scheduleId)
            
            // Insert new
            if (recipient_ids && recipient_ids.length > 0) {
                const recipientRows = recipient_ids.map((cid: string) => ({
                    schedule_id: scheduleId,
                    contact_id: cid
                }))
                const { error: rError } = await supabase.from('automation_recipients').insert(recipientRows)
                if (rError) throw rError
            }
        }

        revalidatePath('/dashboard/admin')
        return { success: true }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        return { success: false, error: message }
    }
}

export async function deleteSchedule(id: string) {
    const supabase = createAdminClient()
    const { error } = await supabase.from('automation_schedules').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/admin')
    return { success: true }
}

export async function triggerAutomation(scheduleId: string) {
  const supabase = createAdminClient()

  try {
      // 1. Fetch Schedule Details
      const { data: schedule, error } = await supabase
          .from('automation_schedules')
          .select(`
              *,
              definition:automation_definitions(*),
              template:automation_templates(*),
              automation_recipients (
                  contact:automation_contacts(*)
              )
          `)
          .eq('id', scheduleId)
          .single()

      if (error) throw new Error(`Erro ao buscar agendamento: ${error.message}`)
      if (!schedule) throw new Error("Agendamento não encontrado")

      if (!schedule.active) {
           // Allow manual trigger even if inactive? Usually yes.
      }

      // 2. Prepare Payload
      const recipients = schedule.automation_recipients
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ?.map((r: any) => r.contact)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ?.filter((c: any) => c !== null && c.active) 
          || []

      const template_content = schedule.template?.content || null
      
      const payload = {
          recipients,
          template_content
      }
      
      // 4. Enqueue Job
      const { error: queueError } = await supabase
        .from('automation_queue')
        .insert({
            schedule_id: scheduleId,
            payload: payload,
            status: 'pending'
        })

      if (queueError) throw new Error(`Erro ao enfileirar execução: ${queueError.message}`)
      
      return { success: true, message: "Execução agendada com sucesso! O sistema irá processar em instantes." }

  } catch (e: unknown) {
      console.error("[Manual Trigger Error]", e)
      const message = e instanceof Error ? e.message : 'Unknown error'
      return { success: false, error: message }
  }
}
