
export type AutomationContact = {
  id: string
  name: string
  phone: string | null
  email: string | null
  department: string | null
  active: boolean
  created_at: string
}

export type AutomationDefinition = {
  id: string
  name: string
  key: string
  description: string | null
}

export type AutomationTemplate = {
  id: string
  name: string
  content: string
  created_at: string
}

export type AutomationSchedule = {
  id: string
  name: string
  automation_definition_id: string
  scheduled_time: string // Time string 'HH:MM:SS'
  days_of_week: number[] | null
  active: boolean
  created_at: string
  definition?: AutomationDefinition
  template_id?: string | null
  template?: AutomationTemplate
  recipients?: AutomationContact[]
}

export type AutomationLog = {
  id: string
  contact_id: string | null
  event_type: string
  details: Record<string, unknown>
  created_at: string
}

export type AccessLog = {
  id: string
  user_id: string | null
  email: string
  event_type: 'login_success' | 'login_failed' | 'blocked'
  ip_address: string | null
  user_agent: string | null
  created_at: string
  // Joined fields
  user?: {
    full_name: string | null
  } | null
}
