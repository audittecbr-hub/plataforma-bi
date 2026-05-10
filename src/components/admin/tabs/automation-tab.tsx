"use client"

import { ScheduleList } from '@/components/admin/automation/schedule-list'
import { ContactList } from '@/components/admin/automation/contact-list'
import type { AutomationContact, AutomationSchedule, AutomationDefinition, AutomationTemplate } from '@/app/actions/automation'

interface AutomationTabProps {
    schedules?: AutomationSchedule[]
    schedulesError?: string
    contacts?: AutomationContact[]
    contactsError?: string
    definitions?: AutomationDefinition[]
    templates?: AutomationTemplate[]
}

export function AutomationTab({
    schedules, schedulesError,
    contacts, contactsError,
    definitions,
    templates,
}: AutomationTabProps) {
    return (
        <div className="space-y-6 mt-4">
             <div className="flex flex-col gap-6">
                <ScheduleList 
                    schedules={schedules} 
                    contacts={contacts} 
                    definitions={definitions}
                    templates={templates}
                    error={schedulesError} 
                />
                
                <ContactList 
                    contacts={contacts} 
                    error={contactsError} 
                />
             </div>
        </div>
    )
}
