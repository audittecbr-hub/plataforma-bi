'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, ChevronLeft, ChevronRight, CheckCircle, XCircle, ShieldX } from 'lucide-react'
import type { AccessLog } from '@/app/actions/automation'

interface AccessLogListProps {
    accessLogs?: AccessLog[]
    error?: string
}

const ITEMS_PER_PAGE = 15

function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

function EventBadge({ eventType }: { eventType: string }) {
    switch (eventType) {
        case 'login_success':
            return (
                <Badge className="bg-green-600 hover:bg-green-700 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Sucesso
                </Badge>
            )
        case 'login_failed':
            return (
                <Badge variant="destructive" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Falhou
                </Badge>
            )
        case 'blocked':
            return (
                <Badge variant="secondary" className="bg-orange-600 hover:bg-orange-700 flex items-center gap-1">
                    <ShieldX className="h-3 w-3" />
                    Bloqueado
                </Badge>
            )
        default:
            return <Badge variant="outline">{eventType}</Badge>
    }
}

export function AccessLogList({ accessLogs, error }: AccessLogListProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [filterType, setFilterType] = useState<string>('all')
    const [currentPage, setCurrentPage] = useState(1)

    // Filter Logic
    const filteredLogs = accessLogs?.filter(log => {
        const searchLower = searchTerm.toLowerCase()
        const matchesSearch = 
            (log.email?.toLowerCase() || '').includes(searchLower) ||
            (log.user?.full_name?.toLowerCase() || '').includes(searchLower) ||
            (log.ip_address?.toLowerCase() || '').includes(searchLower)
        
        const matchesType = filterType === 'all' || log.event_type === filterType
        
        return matchesSearch && matchesType
    }) || []

    // Pagination Logic
    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE)

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value)
        setCurrentPage(1)
    }

    const handleFilterChange = (value: string) => {
        setFilterType(value)
        setCurrentPage(1)
    }

    const goToNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1))
    const goToPrevPage = () => setCurrentPage(p => Math.max(1, p - 1))

    return (
        <Card className="border-none bg-card mt-4">
            <CardHeader className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <CardTitle>Logs de Acesso</CardTitle>
                    <div className="text-sm text-muted-foreground">
                        {filteredLogs.length} registros
                    </div>
                </div>
                
                {/* Filters Row */}
                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Search Bar */}
                    <div className="relative flex-1 sm:max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Pesquisar por email, nome ou IP..."
                            className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-[#D5AE77]"
                            value={searchTerm}
                            onChange={handleSearch}
                        />
                    </div>
                    
                    {/* Type Filter */}
                    <Select value={filterType} onValueChange={handleFilterChange}>
                        <SelectTrigger className="w-full sm:w-44 bg-background border-input text-foreground">
                            <SelectValue placeholder="Tipo de evento" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border">
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="login_success">Sucesso</SelectItem>
                            <SelectItem value="login_failed">Falhou</SelectItem>
                            <SelectItem value="blocked">Bloqueado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-red-500">Erro: {error}</p>
                ) : (
                    <div className="space-y-4">
                        {/* Mobile View */}
                        <div className="grid grid-cols-1 gap-4 md:hidden">
                            {paginatedLogs.map((log) => (
                                <div key={log.id} className="flex flex-col space-y-2 rounded-lg border border-[#D5AE77]/20 bg-card p-4">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-white truncate">{log.email}</span>
                                        <EventBadge eventType={log.event_type} />
                                    </div>
                                    {log.user?.full_name && (
                                        <div className="text-sm text-gray-400">{log.user.full_name}</div>
                                    )}
                                    <div className="text-xs text-muted-foreground">
                                        {formatDate(log.created_at)}
                                    </div>
                                    {log.ip_address && (
                                        <div className="text-xs text-muted-foreground font-mono">
                                            IP: {log.ip_address}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {paginatedLogs.length === 0 && (
                                <div className="text-center py-6 text-muted-foreground">
                                    Nenhum log encontrado.
                                </div>
                            )}
                        </div>

                        {/* Desktop View */}
                        <div className="hidden md:block overflow-x-auto rounded-md border border-[#D5AE77]/20">
                            <Table>
                                <TableHeader className="bg-secondary/50">
                                    <TableRow className="border-[#D5AE77]/20 hover:bg-muted/50">
                                        <TableHead className="text-[#D5AE77] font-semibold">Data/Hora</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">Email</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">Usuário</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">Evento</TableHead>
                                        <TableHead className="text-[#D5AE77] font-semibold">IP</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedLogs.map((log) => (
                                        <TableRow key={log.id} className="border-[#D5AE77]/10 hover:bg-muted/50 transition-colors">
                                            <TableCell className="text-foreground whitespace-nowrap">
                                                {formatDate(log.created_at)}
                                            </TableCell>
                                            <TableCell className="font-medium text-foreground">
                                                {log.email}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {log.user?.full_name || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <EventBadge eventType={log.event_type} />
                                            </TableCell>
                                            <TableCell className="text-muted-foreground font-mono text-xs">
                                                {log.ip_address || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {paginatedLogs.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                Nenhum log encontrado.
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
