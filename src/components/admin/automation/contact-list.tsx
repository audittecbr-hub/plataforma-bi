'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ContactDialog } from './contact-dialog'
import { Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { deleteContact, type AutomationContact } from '@/app/actions/automation'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@/components/ui/alert-dialog"
import { toast } from "sonner"

interface ContactListProps {
    contacts?: AutomationContact[]
    error?: string
}

const ITEMS_PER_PAGE = 10

function formatDepartment(dept: string | null) {
    if (!dept) return '-'
    if (dept.toLowerCase() === 'geral') return 'Diretoria'
    return dept.charAt(0).toUpperCase() + dept.slice(1)
}

export function ContactList({ contacts, error }: ContactListProps) {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [currentPage, setCurrentPage] = useState(1)

    async function handleDelete(id: string) {
        const res = await deleteContact(id)
        if (res.success) {
            toast.success("Contato removido com sucesso")
            router.refresh()
        } else {
            toast.error("Erro ao remover: " + res.error)
        }
    }

    // Filter Logic
    const filteredContacts = contacts?.filter(c => {
        const searchLower = searchTerm.toLowerCase()
        return (
            (c.name?.toLowerCase() || '').includes(searchLower) ||
            (c.phone?.toLowerCase() || '').includes(searchLower) ||
            (c.email?.toLowerCase() || '').includes(searchLower) ||
            (c.department?.toLowerCase() || '').includes(searchLower)
        )
    }) || []

    // Pagination Logic
    const totalPages = Math.ceil(filteredContacts.length / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const paginatedContacts = filteredContacts.slice(startIndex, startIndex + ITEMS_PER_PAGE)

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value)
        setCurrentPage(1) // Reset to first page on search
    }

    const goToNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1))
    const goToPrevPage = () => setCurrentPage(p => Math.max(1, p - 1))

    return (
        <Card className="border-none bg-card mt-4">
            <CardHeader className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                    <CardTitle>Contatos de Automação</CardTitle>
                    <ContactDialog />
                </div>
                
                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Pesquisar por nome, telefone..."
                        className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-[#D5AE77]"
                        value={searchTerm}
                        onChange={handleSearch}
                    />
                </div>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-red-500">Erro: {error}</p>
                ) : (
                    <div className="space-y-4">
                         {/* Mobile View */}
                        <div className="grid grid-cols-1 gap-4 md:hidden">
                            {paginatedContacts.map((c) => (
                                <div key={c.id} className="flex flex-col space-y-3 rounded-lg border bg-card p-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="font-medium">{c.name}</div>
                                        {c.active ? <Badge className="bg-green-600">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                                    </div>
                                    <div className="text-sm text-muted-foreground">{c.phone || '-'} / {c.email || '-'}</div>
                                    <div className="text-sm text-muted-foreground">{formatDepartment(c.department)}</div>
                                    
                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D5AE77]/10">
                                         <ContactDialog contactToEdit={c} />
                                         <DeleteConfirm id={c.id} onDelete={handleDelete} name={c.name} />
                                    </div>
                                </div>
                            ))}
                            {paginatedContacts.length === 0 && (
                                <div className="text-center py-6 text-muted-foreground">
                                    Nenhum contato encontrado.
                                </div>
                            )}
                        </div>

                        {/* Desktop View */}
                        <div className="hidden md:block overflow-x-auto rounded-md border border-[#D5AE77]/20">
                            <Table>
                                <TableHeader className="bg-secondary/50">
                                    <TableRow className="border-[#D5AE77]/20 hover:bg-[#1c1917]">
                                        <TableHead className="text-[#D5AE77] font-semibold">Nome</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">Telefone</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">Email</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">Departamento</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">Status</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedContacts.map((c) => (
                                        <TableRow key={c.id} className="border-[#D5AE77]/10 hover:bg-white/5 transition-colors">
                                            <TableCell className="font-medium text-foreground whitespace-nowrap py-3">{c.name}</TableCell>
                                            <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                                            <TableCell className="text-muted-foreground">{c.email}</TableCell>
                                            <TableCell className="text-muted-foreground">{formatDepartment(c.department)}</TableCell>
                                            <TableCell>
                                                {c.active ? <Badge className="bg-green-600 hover:bg-green-700">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                                            </TableCell>
                                            <TableCell className="text-right flex items-center justify-end gap-2 py-3">
                                                <ContactDialog contactToEdit={c} />
                                                <DeleteConfirm id={c.id} onDelete={handleDelete} name={c.name} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {paginatedContacts.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                Nenhum contato encontrado.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-[#D5AE77]/20 pt-4">
                                <div className="text-sm text-muted-foreground">
                                    Página <span className="text-foreground font-medium">{currentPage}</span> de <span className="text-foreground font-medium">{totalPages}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={goToPrevPage}
                                        disabled={currentPage === 1}
                                        className="h-8 w-8 p-0 border-input text-foreground hover:bg-accent disabled:opacity-50"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={goToNextPage}
                                        disabled={currentPage === totalPages}
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

function DeleteConfirm({ id, onDelete, name }: { id: string, onDelete: (id: string) => void, name: string }) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-100/10">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card text-foreground border-[#D5AE77]/20">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-[#D5AE77]">Excluir Contato?</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        Você tem certeza que deseja excluir <b>{name}</b>? Essa ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="bg-transparent border-input hover:bg-accent text-foreground">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(id)} className="bg-red-600 hover:bg-red-700 text-white border-none">
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

