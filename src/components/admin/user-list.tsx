'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
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
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value)
    }

    return (
        <Card className="border-none bg-card mt-4">
            <CardHeader className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <CardTitle>Gestão de Usuários</CardTitle>
                    <UserDialog />
                </div>
                
                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Pesquisar por nome..."
                        className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
                        value={searchTerm}
                        onChange={handleInputChange}
                    />
                     {isPending && <div className="absolute right-3 top-2.5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/></div>}
                </div>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-red-500">Erro ao carregar usuários: {error}</p>
                ) : (
                    <div className={cn("space-y-4 transition-opacity", isPending ? "opacity-50" : "")}>
                        {/* Mobile Card View */}
                        <div className="grid grid-cols-1 gap-4 md:hidden">
                            {users?.map((u) => (
                                <div key={`mobile-${u.id}`} className="flex flex-col space-y-3 rounded-lg border bg-card p-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="font-medium text-foreground">{u.full_name}</div>
                                        {u.is_admin ? <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Admin</Badge> : <Badge variant="outline" className="text-gray-400 border-gray-700">Usuário</Badge>}
                                    </div>
                                    <div className="text-sm text-gray-400">{u.email}</div>
                                    <div className="text-sm text-gray-300">
                                        <span className="font-semibold text-primary">Departamento:</span> {u.department || '-'}
                                    </div>
                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-primary/10">
                                        <UserDialog userToEdit={u} allUsers={allUsers} />
                                        <DeleteConfirmation 
                                            id={u.id} 
                                            itemType="User" 
                                            deleteAction={deleteUser} 
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto rounded-md border border-primary/20">
                            <Table>
                                <TableHeader className="bg-secondary/50">
                                    <TableRow className="border-primary/20 hover:bg-muted/50">
                                        <TableHead className="text-primary font-semibold">Nome</TableHead>
                                        <TableHead className="text-primary font-semibold">E-mail</TableHead>
                                        <TableHead className="text-primary font-semibold">Departamento</TableHead>
                                        <TableHead className="text-primary font-semibold">Função</TableHead>
                                        <TableHead className="text-primary font-semibold text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users?.map((u) => (
                                        <TableRow key={u.id} className="border-primary/10 hover:bg-muted/50 transition-colors">
                                            <TableCell className="font-medium text-foreground whitespace-nowrap py-3">{u.full_name}</TableCell>
                                            <TableCell className="text-muted-foreground">{u.email}</TableCell>
                                            <TableCell className="text-muted-foreground">{u.department}</TableCell>
                                            <TableCell>
                                                {u.is_admin ? <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Admin</Badge> : <Badge variant="outline" className="text-gray-400 border-gray-700">Usuário</Badge>}
                                            </TableCell>
                                            <TableCell className="text-right flex items-center justify-end gap-2 py-3">
                                                <UserDialog userToEdit={u} allUsers={allUsers} />
                                                <DeleteConfirmation 
                                                    id={u.id} 
                                                    itemType="User" 
                                                    deleteAction={deleteUser} 
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {users?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                Nenhum usuário encontrado.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-primary/20 pt-4">
                                <div className="text-sm text-muted-foreground">
                                    Página <span className="text-foreground font-medium">{currentPage}</span> de <span className="text-foreground font-medium">{totalPages}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={goToPrevPage}
                                        disabled={currentPage <= 1 || isPending}
                                        className="h-8 w-8 p-0 border-input text-foreground hover:bg-accent disabled:opacity-50"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={goToNextPage}
                                        disabled={currentPage >= totalPages || isPending}
                                        className="h-8 w-8 p-0 border-input text-foreground hover:bg-accent disabled:opacity-50"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
