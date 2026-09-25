'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleAlert, Contact, Trash2 } from 'lucide-react'
import { toast } from "sonner"
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { DepartmentChip } from '@/components/ui/department-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader, PanelToolbar } from '@/components/ui/panel'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DestructiveConfirm, IconAction, PaginationBar, SearchField } from '@/components/admin/admin-ui'
import { ContactDialog } from './contact-dialog'
import { deleteContact, type AutomationContact } from '@/app/actions/automation'
import { contactDepartmentLabel } from '@/lib/department-meta'

interface ContactListProps {
    contacts?: AutomationContact[]
    error?: string
}

const ITEMS_PER_PAGE = 10

/** "5551999887766" → "+55 (51) 99988-7766". Outros formatos passam intactos. */
function formatPhone(phone: string | null) {
    if (!phone) return null
    const digits = phone.replace(/\D/g, '')
    const br = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : null
    if (!br) return phone
    const ddd = br.slice(0, 2)
    const rest = br.slice(2)
    const split = rest.length === 9 ? 5 : 4
    return `+55 (${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
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

    const handleSearch = (value: string) => {
        setSearchTerm(value)
        setCurrentPage(1) // Reset to first page on search
    }

    const goToNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1))
    const goToPrevPage = () => setCurrentPage(p => Math.max(1, p - 1))

    const status = (c: AutomationContact) =>
        c.active ? <Badge variant="gold" dot>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>

    const actions = (c: AutomationContact) => (
        <div className="flex items-center justify-end gap-0.5">
            <ContactDialog contactToEdit={c} />
            <DestructiveConfirm
                trigger={<IconAction label="Excluir contato" icon={Trash2} tone="danger" />}
                title="Excluir contato?"
                description={<>Você tem certeza que deseja excluir <span className="font-semibold text-foreground">{c.name}</span>? Essa ação não pode ser desfeita.</>}
                onConfirm={() => handleDelete(c.id)}
            />
        </div>
    )

    return (
        <Panel>
            <PanelHeader
                icon={Contact}
                eyebrow="Automação"
                title="Contatos de envio"
                description="Quem recebe os relatórios automáticos por WhatsApp e e-mail."
                actions={<ContactDialog />}
            />

            <PanelToolbar>
                <SearchField
                    id="busca-contatos"
                    value={searchTerm}
                    onChange={handleSearch}
                    placeholder="Pesquisar por nome, telefone…"
                />
            </PanelToolbar>

            {error ? (
                <EmptyState compact icon={CircleAlert} title="Não foi possível carregar os contatos" description={error} />
            ) : paginatedContacts.length === 0 ? (
                <EmptyState compact icon={Contact} title="Nenhum contato encontrado" description={searchTerm ? `Nada corresponde a “${searchTerm}”.` : 'Adicione o primeiro contato de envio.'} />
            ) : (
                <>
                    {/* Mobile */}
                    <ul className="divide-y border-t md:hidden">
                        {paginatedContacts.map((c) => (
                            <li key={c.id} className="flex items-start gap-3 px-5 py-4">
                                <Avatar name={c.name} size={40} />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                                        {status(c)}
                                    </div>
                                    <p className="truncate text-[13px] tabular-nums text-muted-foreground">{formatPhone(c.phone) || '—'}</p>
                                    {c.email && <p className="truncate text-[13px] text-muted-foreground">{c.email}</p>}
                                    <div className="flex items-center justify-between gap-2 pt-1">
                                        <DepartmentChip label={contactDepartmentLabel(c.department)} />
                                        {actions(c)}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>

                    {/* Desktop */}
                    <div className="hidden border-t md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Contato</TableHead>
                                    <TableHead>WhatsApp</TableHead>
                                    <TableHead>E-mail</TableHead>
                                    <TableHead>Departamento</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedContacts.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar name={c.name} size={32} />
                                                <span className="font-semibold text-foreground">{c.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="tabular-nums text-muted-foreground">{formatPhone(c.phone) || '—'}</TableCell>
                                        <TableCell className="text-muted-foreground">{c.email || '—'}</TableCell>
                                        <TableCell><DepartmentChip label={contactDepartmentLabel(c.department)} /></TableCell>
                                        <TableCell>{status(c)}</TableCell>
                                        <TableCell className="text-right">{actions(c)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            <PaginationBar page={currentPage} totalPages={totalPages} onPrev={goToPrevPage} onNext={goToNextPage} />
        </Panel>
    )
}
