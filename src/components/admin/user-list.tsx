'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { CircleAlert, Users, UserRound } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { DepartmentChip } from '@/components/ui/department-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader, PanelToolbar } from '@/components/ui/panel'
import { PaginationBar, SearchField } from '@/components/admin/admin-ui'
import { deleteUser, type AdminUser } from '@/app/dashboard/admin/actions'
import { UserDialog } from '@/components/admin/user-dialog'
import { DeleteConfirmation } from '@/components/admin/delete-confirmation'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface UserListProps {
    users?: AdminUser[]
    allUsers?: { id: string; name: string }[]
    totalPages?: number
    currentPage?: number
    initialSearch?: string
    error?: string
}

function RoleBadges({ user }: { user: AdminUser }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {user.is_admin && <Badge variant="solid">Admin</Badge>}
            {user.is_leader && <Badge variant="gold">Líder</Badge>}
            {!user.is_admin && !user.is_leader && <Badge variant="outline">Colaborador</Badge>}
        </div>
    )
}

function ExtraAreas({ user }: { user: AdminUser }) {
    const extras = user.allowed_sub_departments?.length ?? 0
    if (!extras) return null
    return (
        <span
            className="text-xs text-muted-foreground"
            title={user.allowed_sub_departments?.join(', ')}
        >
            +{extras} {extras === 1 ? 'área' : 'áreas'}
        </span>
    )
}

export function UserList({
    users,
    allUsers,
    totalPages = 1,
    currentPage = 1,
    initialSearch = '',
    error,
}: UserListProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    // Local state for immediate input feedback, but source of truth is URL
    const [searchTerm, setSearchTerm] = useState(initialSearch)
    const [isPending, startTransition] = useTransition()

    // Sync local state if URL changes externally (optional but good practice)
    useEffect(() => {
        setSearchTerm(initialSearch)
    }, [initialSearch])

    const createQueryString = useCallback(
        (params: Record<string, string | number | null>) => {
          const newParams = new URLSearchParams(searchParams.toString())
          Object.entries(params).forEach(([key, value]) => {
            if (value === null) {
              newParams.delete(key)
            } else {
              newParams.set(key, String(value))
            }
          })
          return newParams.toString()
        },
        [searchParams]
    )

    // Debounce effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm !== initialSearch) {
                startTransition(() => {
                    router.push(`?${createQueryString({ search: searchTerm, page: 1 })}`)
                })
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [searchTerm, router, createQueryString, initialSearch])


    const goToNextPage = () => {
        startTransition(() => {
            router.push(`?${createQueryString({ page: currentPage + 1 })}`)
        })
    }

    const goToPrevPage = () => {
        startTransition(() => {
            router.push(`?${createQueryString({ page: currentPage - 1 })}`)
        })
    }

    const hasUsers = (users?.length ?? 0) > 0

    return (
        <Panel>
            <PanelHeader
                icon={Users}
                eyebrow="Acesso"
                title="Gestão de usuários"
                description="Contas do portal, departamento principal, permissões extras e papéis."
                actions={<UserDialog />}
            />

            <PanelToolbar>
                <SearchField
                    id="busca-usuarios"
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Pesquisar por nome…"
                    pending={isPending}
                />
            </PanelToolbar>

            {error ? (
                <EmptyState compact icon={CircleAlert} title="Não foi possível carregar os usuários" description={error} />
            ) : !hasUsers ? (
                <EmptyState
                    compact
                    icon={UserRound}
                    title="Nenhum usuário encontrado"
                    description={searchTerm ? `Nada corresponde a “${searchTerm}”.` : 'Adicione o primeiro usuário do portal.'}
                />
            ) : (
                <div className={cn("transition-opacity duration-200", isPending && "opacity-50")}>
                    {/* Mobile */}
                    <ul className="divide-y border-t md:hidden">
                        {users?.map((u) => (
                            <li key={`mobile-${u.id}`} className="flex items-start gap-3 px-5 py-4">
                                <Avatar name={u.full_name} email={u.email} size={40} />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div>
                                        <p className="truncate text-sm font-semibold text-foreground">{u.full_name}</p>
                                        <p className="truncate text-[13px] text-muted-foreground">{u.email}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <DepartmentChip department={u.department} />
                                        <ExtraAreas user={u} />
                                    </div>
                                    <RoleBadges user={u} />
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                    <UserDialog userToEdit={u} allUsers={allUsers} />
                                    <DeleteConfirmation id={u.id} itemType="User" itemName={u.full_name ?? u.email} deleteAction={deleteUser} />
                                </div>
                            </li>
                        ))}
                    </ul>

                    {/* Desktop */}
                    <div className="hidden border-t md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Departamento</TableHead>
                                    <TableHead>Papel</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users?.map((u) => (
                                    <TableRow key={u.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar name={u.full_name} email={u.email} size={36} />
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-foreground">{u.full_name}</p>
                                                    <p className="truncate text-[13px] text-muted-foreground">{u.email}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2.5">
                                                <DepartmentChip department={u.department} />
                                                <ExtraAreas user={u} />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <RoleBadges user={u} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-0.5">
                                                <UserDialog userToEdit={u} allUsers={allUsers} />
                                                <DeleteConfirmation id={u.id} itemType="User" itemName={u.full_name ?? u.email} deleteAction={deleteUser} />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <PaginationBar
                        page={currentPage}
                        totalPages={totalPages}
                        onPrev={goToPrevPage}
                        onNext={goToNextPage}
                        disabled={isPending}
                    />
                </div>
            )}
        </Panel>
    )
}
