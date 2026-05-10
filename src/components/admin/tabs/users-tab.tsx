"use client"

import { UserList } from '@/components/admin/user-list'
import type { AdminUser } from '@/app/dashboard/admin/actions'

interface UsersTabProps {
    users?: AdminUser[]
    allUsers?: { id: string; name: string }[]
    totalPages?: number
    currentPage?: number
    search?: string
    error?: string
}

export function UsersTab({ users, allUsers, totalPages, currentPage, search, error }: UsersTabProps) {
    return (
        <div className="mt-4">
            <UserList
                users={users}
                allUsers={allUsers}
                totalPages={totalPages}
                currentPage={currentPage}
                initialSearch={search}
                error={error}
            />
        </div>
    )
}
