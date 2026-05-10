"use client"

import { AccessLogList } from '@/components/admin/access-log-list'
import type { AccessLog } from '@/app/actions/automation'

interface AccessLogsTabProps {
    accessLogs?: AccessLog[]
    error?: string
}

export function AccessLogsTab({ accessLogs, error }: AccessLogsTabProps) {
    return (
        <div className="mt-4">
            <AccessLogList accessLogs={accessLogs} error={error} />
        </div>
    )
}
