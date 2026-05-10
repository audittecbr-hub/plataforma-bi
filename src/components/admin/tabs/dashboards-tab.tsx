"use client"

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DashboardDialog } from '@/components/admin/dashboard-dialog'
import { DeleteConfirmation } from '@/components/admin/delete-confirmation'
import {
    deleteDashboard,
    refreshDashboards,
    getPowerBIRefreshLogs,
    getDashboardsRefreshStatus,
    type PowerBIRefreshLog,
} from '@/app/dashboard/admin/actions'
import type { Dashboard } from '@/app/dashboard/admin/actions'
import { RefreshCw, CheckCircle2, AlertCircle, Clock, History, Zap, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
import type { RefreshHistoryItem } from '@/lib/powerbi'

interface DashboardsTabProps {
    dashboards?: Dashboard[]
    allUsers?: { id: string; name: string }[]
    error?: string
    totalPages?: number
    currentPage?: number
    search?: string
}

// Ícone e cor de acordo com o status retornado pela API do Power BI
function RefreshStatusBadge({ status }: { status?: string }) {
    if (!status) return <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tight opacity-50">—</Badge>

    const map: Record<string, { label: string; color: string }> = {
        Completed: { label: 'Concluído', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        Failed: { label: 'Falhou', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
        InProgress: { label: 'Em Progresso', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        Unknown: { label: 'Atualizando', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        Disabled: { label: 'Desabilitado', color: 'bg-muted text-muted-foreground border-transparent' },
        Cancelled: { label: 'Cancelado', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    }

    const config = map[status] ?? { label: status, color: 'bg-muted text-muted-foreground' }
    return (
        <span className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
            {config.label}
        </span>
    )
}

export function DashboardsTab({ dashboards, allUsers, error, totalPages = 1, currentPage = 1, search = '' }: DashboardsTabProps) {
    const router = useRouter()
    const pathname = usePathname()
    // Controla o valor do input sem rerender desnecessário
    const [searchValue, setSearchValue] = useState(search)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Navega para nova página ou nova busca via URL (SSR-friendly)
    const navigate = useCallback((newPage: number, newSearch?: string) => {
        const params = new URLSearchParams()
        params.set('tab', 'dashboards')
        params.set('page', String(newPage))
        if (newSearch !== undefined ? newSearch : search) {
            params.set('search', newSearch !== undefined ? newSearch : search)
        }
        router.push(`${pathname}?${params.toString()}`)
    }, [router, pathname, search])

    // Debounce da busca para não disparar a cada tecla
    const handleSearchChange = (value: string) => {
        setSearchValue(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            navigate(1, value)
        }, 400)
    }
    const [selectedDashboards, setSelectedDashboards] = useState<string[]>([])
    const [isRefreshing, startRefreshTransition] = useTransition()
    const [logs, setLogs] = useState<PowerBIRefreshLog[]>([])
    const [isLoadingLogs, setIsLoadingLogs] = useState(true) // Inicia como true para evitar setState imediato no effect
    const [refreshStatus, setRefreshStatus] = useState<Record<string, RefreshHistoryItem | null>>({})
    const [isLoadingStatus, setIsLoadingStatus] = useState(true) // Inicia como true
    const [logsPage, setLogsPage] = useState(1)

    const LOGS_PER_PAGE = 5

    // Busca histórico de atualizações do Supabase e reseta a página
    const fetchLogs = useCallback(async () => {
        setIsLoadingLogs(true)
        const result = await getPowerBIRefreshLogs()
        if (result.success) {
            setLogs((result.logs as PowerBIRefreshLog[]) || [])
            setLogsPage(1)
        }
        setIsLoadingLogs(false)
    }, [])

    // Consulta o status atual de cada dataset diretamente na API do Power BI
    const fetchStatus = useCallback(async () => {
        setIsLoadingStatus(true)
        const result = await getDashboardsRefreshStatus()
        if (result.success && result.status) {
            setRefreshStatus(result.status as Record<string, RefreshHistoryItem | null>)
        }
        setIsLoadingStatus(false)
    }, [])

    useEffect(() => {
        // Envolve em uma IIFE async para evitar chamadas de setState síncronas bloqueantes
        // e satisfazer a regra react-hooks/set-state-in-effect
        const bootstrap = async () => {
            await Promise.all([fetchLogs(), fetchStatus()])
        }
        void bootstrap()
    }, [fetchLogs, fetchStatus])

    const toggleDashboard = (name: string) => {
        setSelectedDashboards(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        )
    }

    const toggleAll = () => {
        if (selectedDashboards.length === dashboards?.length) {
            setSelectedDashboards([])
        } else {
            setSelectedDashboards(dashboards?.map(d => d.name) || [])
        }
    }

    const handleRefresh = () => {
        if (selectedDashboards.length === 0) return

        startRefreshTransition(async () => {
            const result = await refreshDashboards(selectedDashboards)
            if (result.success) {
                toast.success(`Atualização solicitada para ${selectedDashboards.length} dashboard(s)`)
                setSelectedDashboards([])
                // Atualiza logs e status após breve delay para o PBI processar
                setTimeout(() => {
                    fetchLogs()
                    fetchStatus()
                }, 3000)
            } else {
                toast.error(result.error || 'Erro ao solicitar atualização')
            }
        })
    }

    return (
        <div className="space-y-6 mt-4">
            <Card className="border-none bg-card">
                <CardHeader className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                        <div>
                            <CardTitle className="text-xl md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                Gestão de Dashboards
                            </CardTitle>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1.5 focus-within:opacity-100 transition-opacity">
                                {totalPages > 0 ? (
                                    <div className="flex items-center gap-2 px-2 py-0.5 rounded-[2px] border border-[#D5AE77]/20 bg-[#D5AE77]/5 backdrop-blur-sm">
                                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/50">Admin Center</span>
                                        <div className="w-[1px] h-3 bg-[#D5AE77]/20" />
                                        <span className="text-xs font-bold text-[#D5AE77]">
                                            Página {currentPage} <span className="text-muted-foreground/60 font-medium mx-0.5 lowercase">de</span> {totalPages}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest px-2 py-0.5 border border-rose-500/20 bg-rose-500/5 rounded-[2px]">Nenhum dashboard encontrado</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                        {selectedDashboards.length > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-[#D5AE77] text-[#D5AE77] hover:bg-[#D5AE77]/10"
                                        disabled={isRefreshing}
                                    >
                                        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                        Atualizar ({selectedDashboards.length})
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Confirmar Atualização</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Deseja realmente solicitar a atualização para {selectedDashboards.length} dashboard(s) selecionado(s)?
                                            Isso disparará o processo de refresh no Power BI.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleRefresh}
                                            className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-white transition-all active:scale-95"
                                        >
                                            Cristhofer, atualiza o BI, por favor
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                            <DashboardDialog allUsers={allUsers} />
                        </div>
                    </div>

                    {/* Barra de busca */}
                    <div className="relative group/search">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within/search:text-[#D5AE77] transition-colors pointer-events-none" />
                        <Input
                            placeholder="Buscar por nome ou departamento..."
                            value={searchValue}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="pl-9 h-11 bg-background/50 border-[#D5AE77]/10 focus-visible:border-[#D5AE77]/40 focus-visible:ring-[#D5AE77]/10 rounded-[2px] transition-all"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-focus-within/search:opacity-100 transition-opacity">
                             <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground flex">
                                <span className="text-xs">esc</span>
                            </kbd>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {error ? (
                        <p className="text-red-500">Erro ao carregar dashboards: {error}</p>
                    ) : (
                        <div className="space-y-4">
                            {/* Mobile */}
                            <div className="grid grid-cols-1 gap-4 md:hidden">
                                {dashboards?.map((d) => (
                                    <div key={`mobile-${d.id}`} className="flex flex-col space-y-3 rounded-lg border bg-card p-4 shadow-sm relative">
                                        <div className="absolute top-4 right-4">
                                            <Checkbox
                                                checked={selectedDashboards.includes(d.name)}
                                                onCheckedChange={() => toggleDashboard(d.name)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between pr-8">
                                            <div className="font-medium mr-2">{d.name}</div>
                                            <Badge variant="outline" className="whitespace-nowrap">{d.department}</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground truncate max-w-full">
                                            URL: {d.embed_url}
                                        </div>
                                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D5AE77]/10">
                                            <DashboardDialog dashboardToEdit={d} allUsers={allUsers} />
                                            <DeleteConfirmation id={d.id} itemType="Dashboard" deleteAction={deleteDashboard} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop */}
                            <div className="hidden md:block overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[40px]">
                                                <Checkbox
                                                    checked={selectedDashboards.length === dashboards?.length && dashboards?.length > 0}
                                                    onCheckedChange={toggleAll}
                                                />
                                            </TableHead>
                                            <TableHead>Nome</TableHead>
                                            <TableHead>Departamento</TableHead>
                                            <TableHead>URL</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dashboards?.map((d) => (
                                            <TableRow key={d.id} className="group/row transition-all duration-300 hover:bg-[#D5AE77]/5 border-l-2 border-l-transparent hover:border-l-[#D5AE77]/40">
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedDashboards.includes(d.name)}
                                                        onCheckedChange={() => toggleDashboard(d.name)}
                                                        className="data-[state=checked]:bg-[#D5AE77] data-[state=checked]:border-[#D5AE77]"
                                                    />
                                                </TableCell>
                                                <TableCell className="font-bold whitespace-nowrap text-foreground group-hover/row:text-[#D5AE77] transition-colors">
                                                    {d.name}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="rounded-[2px] text-[10px] uppercase font-bold tracking-wider border-[#D5AE77]/20 text-[#D5AE77]/80 bg-[#D5AE77]/5 group-hover/row:border-[#D5AE77]/40">
                                                        {d.department}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground/40 group-hover/row:text-muted-foreground/80 font-mono transition-opacity">
                                                    {d.embed_url}
                                                </TableCell>
                                                <TableCell className="text-right flex items-center justify-end gap-2">
                                                    <DashboardDialog dashboardToEdit={d} allUsers={allUsers} />
                                                    <DeleteConfirmation id={d.id} itemType="Dashboard" deleteAction={deleteDashboard} />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                        </div>
                        </div>
                    )}

                    {/* Controles de paginação da tabela de dashboards */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-6 mt-6 border-t border-[#D5AE77]/10">
                            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40">
                                {currentPage} <span className="opacity-30">/</span> {totalPages}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => navigate(currentPage - 1)}
                                    disabled={currentPage <= 1}
                                    className="h-8 w-8 rounded-[2px] border-[#D5AE77]/10 hover:border-[#D5AE77]/40 hover:bg-[#D5AE77]/5 transition-all"
                                >
                                    <ChevronLeft className="h-4 w-4 text-[#D5AE77]" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => navigate(currentPage + 1)}
                                    disabled={currentPage >= totalPages}
                                    className="h-8 w-8 rounded-[2px] border-[#D5AE77]/10 hover:border-[#D5AE77]/40 hover:bg-[#D5AE77]/5 transition-all"
                                >
                                    <ChevronRight className="h-4 w-4 text-[#D5AE77]" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>

            </Card>

            {/* Status ao Vivo dos Datasets */}
            <Card className="border-none bg-card shadow-sm overflow-hidden rounded-[2px]">
                <CardHeader className="flex flex-row items-center justify-between border-b border-[#D5AE77]/5 bg-[#D5AE77]/5">
                    <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2 uppercase tracking-wide">
                            <Zap className="h-4 w-4 text-[#D5AE77]" />
                            Status das Atualizações
                        </CardTitle>
                        <CardDescription className="text-[11px] opacity-70">Último refresh de cada dataset no Power BI</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={isLoadingStatus}>
                        <RefreshCw className={`h-4 w-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                    </Button>
                </CardHeader>
                <CardContent className="pt-4 px-6 pb-2">
                    {isLoadingStatus ? (
                        <div className="flex items-center gap-2 text-[#D5AE77] text-xs py-10 justify-center font-bold tracking-widest uppercase animate-pulse">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Sincronizando Power BI...
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {Object.keys(refreshStatus).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-8 text-center italic">
                                    Nenhum status disponível. Clique em atualizar para verificar.
                                </p>
                            ) : (
                                Object.entries(refreshStatus).map(([name, item]) => (
                                    <div key={name} className="flex items-center justify-between py-3 group/status">
                                        <span className="text-sm font-bold text-foreground group-hover/status:text-[#D5AE77] transition-colors">{name}</span>
                                        <div className="flex items-center gap-4">
                                            {item?.endTime && (
                                                <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5 tabular-nums">
                                                    <Clock className="h-3 w-3 opacity-40" />
                                                    {format(new Date(item.endTime), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                                </span>
                                            )}
                                            <RefreshStatusBadge status={item?.status} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Histórico de Atualizações */}
            <Card className="border-none bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <History className="h-5 w-5 text-[#D5AE77]" />
                            Histórico de Atualizações
                        </CardTitle>
                        <CardDescription>Registros de sucesso e falha das solicitações de refresh</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={isLoadingLogs}>
                        <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                    </Button>
                </CardHeader>
                <CardContent>
                    {isLoadingLogs ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Carregando logs...
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <CheckCircle2 className="h-12 w-12 text-green-500/20 mb-2" />
                            <p>Nenhum registro de atualização encontrado.</p>
                        </div>
                    ) : (() => {
                        const totalPages = Math.ceil(logs.length / LOGS_PER_PAGE)
                        const paginatedLogs = logs.slice((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE)
                        return (
                            <div className="space-y-3">
                                {paginatedLogs.map((log) => {
                                    const isError = log.event_type === 'job_error'
                                    const details = typeof log.details === 'object' && log.details !== null ? log.details as Record<string, unknown> : {}
                                    const dashboardName = details.dashboard as string | undefined
                                    const errorMsg = details.error as string | undefined

                                    return (
                                        <div
                                            key={log.id}
                                            className={`flex items-start gap-3 p-3 rounded-lg border ${isError
                                                ? 'border-red-500/10 bg-red-500/5'
                                                : 'border-green-500/10 bg-green-500/5'
                                                }`}
                                        >
                                            {isError ? (
                                                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                                            ) : (
                                                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                            )}
                                            <div className="flex-1 space-y-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium text-sm truncate">
                                                        {isError ? 'Falha' : 'Solicitado'}{dashboardName ? ` — ${dashboardName}` : ''}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                                        <Clock className="h-3 w-3" />
                                                        {format(new Date(log.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                                    </span>
                                                </div>
                                                {errorMsg && (
                                                    <p className="text-xs text-muted-foreground leading-relaxed break-all">{errorMsg}</p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}

                                {/* Controles de paginação */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between pt-3 border-t border-border/40">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                                            disabled={logsPage === 1}
                                            className="text-xs"
                                        >
                                            ← Anterior
                                        </Button>
                                        <span className="text-xs text-muted-foreground">
                                            Página {logsPage} de {totalPages}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setLogsPage(p => Math.min(totalPages, p + 1))}
                                            disabled={logsPage === totalPages}
                                            className="text-xs"
                                        >
                                            Próxima →
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )
                    })()}
                </CardContent>
            </Card>
        </div>
    )
}
