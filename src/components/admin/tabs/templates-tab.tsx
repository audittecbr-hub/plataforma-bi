"use client"

import { TemplateList } from '@/components/admin/automation/template-list'
import type { AutomationTemplate } from '@/app/actions/automation'

interface TemplatesTabProps {
    templates?: AutomationTemplate[]
    error?: string
}

export function TemplatesTab({ templates, error }: TemplatesTabProps) {
    return (
        <div className="mt-4">
            <TemplateList templates={templates} error={error} />
        </div>
    )
}
