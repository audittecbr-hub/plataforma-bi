
'use server'

import { createAdminClient } from "@/utils/supabase/admin"
import { AutomationLog, AccessLog } from "./types"

export async function getLogs(): Promise<{ success: boolean; logs?: AutomationLog[]; error?: string }> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('automation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return { success: false, error: error.message }
    return { success: true, logs: data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function getAccessLogs(): Promise<{ success: boolean; accessLogs?: AccessLog[]; error?: string }> {
  try {
    const supabase = createAdminClient()
    
    // Fetch access logs
    const { data: logs, error } = await supabase
      .from('access_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return { success: false, error: error.message }
    if (!logs) return { success: true, accessLogs: [] }

    // Get unique user_ids that are not null
    const userIds = [...new Set(logs.filter(l => l.user_id).map(l => l.user_id))]
    
    // Fetch profiles for those users
    const profilesMap = new Map<string, { full_name: string | null }>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)
      
      if (profiles) {
        profiles.forEach(p => profilesMap.set(p.id, { full_name: p.full_name }))
      }
    }

    // Combine logs with user info
    const enrichedLogs = logs.map(log => ({
      ...log,
      user: log.user_id ? profilesMap.get(log.user_id) || null : null
    }))

    return { success: true, accessLogs: enrichedLogs }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
