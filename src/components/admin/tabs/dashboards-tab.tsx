"use client"

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { DepartmentChip } from '@/components/ui/department-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader, PanelToolbar } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar, SearchField, IconAction } from '@/components/admin/admin-ui'
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
import { RefreshCw, CircleCheck, CircleAlert, Clock, History, LayoutDashboard, Zap, LoaderCircle } from 'lucide-react'
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
import { cn } from '@/lib/utils'

interface DashboardsTabProps {
    dashboards?: Dashboard[]
    allUsers?: { id: string; name: string }[]
    error?: string
    totalPages?: number
    currentPage?: number
    search?: string
}

// Rótulo e tom de acordo com o status retornado pela API do Power BI
const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'outline' }> = {
    Completed: { label: 'Concluído', variant: 'success' },
    Failed: { label: 'Falhou', variant: 'danger' },
    InProgress: { label: 'Em progresso', variant: 'warning' },
    Unknown: { label: 'Atualizando', variant: 'warning' },
    Disabled: { label: 'Desabilitado', variant: 'outline' },
    Cancelled: { label: 'Cancelado', variant: 'warning' },
}

function RefreshStatusBadge({ status }: { status?: string }) {
    if (!status) return <Badge variant="outline">Sem registro</Badge>
    const config = STATUS_MAP[status] ?? { label: status, variant: 'outline' as const }
    const live = status === 'InProgress' || status === 'Unknown'
    return (
        <Badge variant={config.variant} dot pulse={live}>
            {config.label}
        </Badge>
    )
}

function formatWhen(value: string) {
    return format(new Date(value), "dd/MM 'às' HH:mm", { locale: ptBR })
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

    const allSelected = !!dashboards?.length && selectedDashboards.length === dashboards.length
    const logsTotalPages = Math.ceil(logs.length / LOGS_PER_PAGE)
    const paginatedLogs = logs.slice((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE)

    return (
        <div className="space-y-6">
            <Panel>
                <PanelHeader
                    icon={LayoutDashboard}
                    eyebrow="Conteúdo"
                    title="Gestão de dashboards"
                    description="Relatórios do Power BI publicados no portal, visibilidade por área e atualização de dados."
                    actions={
                        <>
                            {selectedDashboards.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" disabled={isRefreshing}>
                                            <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
                                            Atualizar ({selectedDashboards.length})
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar atualização</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Deseja realmente solicitar a atualização para {selectedDashboards.length} dashboard(s) selecionado(s)?
                                                Isso disparará o processo de refresh no Power BI.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleRefresh}>
                                                Cristhofer, atualiza o BI, por favor
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            <DashboardDialog allUsers={allUsers} />
                        </>
                    }
                />

                <PanelToolbar className="justify-between">
                    <SearchField
                        id="busca-dashboards"
                        value={searchValue}
                        onChange={handleSearchChange}
                        placeholder="Buscar por nome ou departamento…"
                    />
                    {selectedDashboards.length > 0 && (
                        <p className="text-[13px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{selectedDashboards.length}</span> selecionado(s) para atualizar
                        </p>
                    )}
                </PanelToolbar>

                {error ? (
                    <EmptyState compact icon={CircleAlert} title="Não foi possível carregar os dashboards" description={error} />
                ) : !dashboards?.length ? (
                    <EmptyState
                        compact
                        icon={LayoutDashboard}
                        title="Nenhum dashboard encontrado"
                        description={searchValue ? `Nada corresponde a “${searchValue}”.` : 'Adicione o primeiro relatório do portal.'}
                    />
                ) : (
                    <>
                        {/* Mobile */}
                        <ul className="divide-y border-t md:hidden">
                            {dashboards.map((d) => (
                                <li key={`mobile-${d.id}`} className="flex items-start gap-3 px-5 py-4">
                                    <Checkbox
                                        className="mt-0.5"
                                        checked={selectedDashboards.includes(d.name)}
                                        onCheckedChange={() => toggleDashboard(d.name)}
                                        aria-label={`Selecionar ${d.name}`}
                                    />
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                        <p className="truncate text-sm font-semibold text-foreground">{d.name}</p>
                                        <DepartmentChip department={d.department} />
                                        <p className="truncate font-mono text-[11.5px] text-faint">{d.embed_url}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        <DashboardDialog dashboardToEdit={d} allUsers={allUsers} />
                                        <DeleteConfirmation id={d.id} itemType="Dashboard" itemName={d.name} deleteAction={deleteDashboard} />
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {/* Desktop */}
                        <div className="hidden border-t md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[52px]">
                                            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                                        </TableHead>
                                        <TableHead>Dashboard</TableHead>
                                        <TableHead>Departamento</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dashboards.map((d) => {
                                        const selected = selectedDashboards.includes(d.name)
                                        const extras = d.allowed_departments?.length ?? 0
                                        const individual = !!d.assigned_user_id || !!d.sub_group
                                        return (
                                            <TableRow key={d.id} data-state={selected ? 'selected' : undefined}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selected}
                                                        onCheckedChange={() => toggleDashboard(d.name)}
                                                        aria-label={`Selecionar ${d.name}`}
                                                    />
                                                </TableCell>
                                                <TableCell className="max-w-[420px]">
                                                    <p className="truncate font-semibold text-foreground">{d.name}</p>
                                                    <p className="truncate font-mono text-[11.5px] text-faint" title={d.embed_url}>{d.embed_url}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2.5">
                                                        <DepartmentChip department={d.department} />
                                                        {extras > 0 && (
                                                            <span className="text-xs text-muted-foreground" title={d.allowed_departments?.join(', ')}>
                                                                +{extras}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {individual ? <Badge variant="gold">Metas líderes</Badge> : <Badge variant="outline">Departamento</Badge>}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-0.5">
                                                        <DashboardDialog dashboardToEdit={d} allUsers={allUsers} />
                                                        <DeleteConfirmation id={d.id} itemType="Dashboard" itemName={d.name} deleteAction={deleteDashboard} />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}

                {/* Controles de paginação da tabela de dashboards */}
                <PaginationBar
                    page={currentPage}
                    totalPages={totalPages}
                    onPrev={() => navigate(currentPage - 1)}
                    onNext={() => navigate(currentPage + 1)}
                />
            </Panel>

            <div className="grid gap-6 xl:grid-cols-5">
                {/* Status ao vivo dos datasets */}
                <Panel className="xl:col-span-3">
                    <PanelHeader
                        icon={Zap}
                        eyebrow="Power BI"
                        title="Status das atualizações"
                        description="Último refresh de cada dataset, direto da API do Power BI."
                        actions={<IconAction label="Consultar novamente" icon={RefreshCw} onClick={fetchStatus} disabled={isLoadingStatus} className={cn(isLoadingStatus && '[&_svg]:animate-spin')} />}
                    />
                    <div className="border-t p-5 md:p-6">
                        {isLoadingStatus ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <Skeleton key={i} className="h-[74px] rounded-xl" />
                                ))}
                            </div>
                        ) : Object.keys(refreshStatus).length === 0 ? (
                            <EmptyState compact icon={Zap} title="Nenhum status disponível" description="Clique em consultar para verificar os datasets." />
                        ) : (
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {Object.entries(refreshStatus).map(([name, item]) => (
                                    <li key={name} className="flex flex-col gap-2.5 rounded-xl border bg-surface p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm font-semibold leading-snug text-foreground">{name}</p>
                                            <RefreshStatusBadge status={item?.status} />
                                        </div>
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                                            <Clock className="size-3.5 text-faint" />
                                            {item?.endTime ? formatWhen(item.endTime) : item?.startTime ? `Iniciado ${formatWhen(item.startTime)}` : 'Sem registro recente'}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Panel>

                {/* Histórico de atualizações */}
                <Panel className="xl:col-span-2">
                    <PanelHeader
                        icon={History}
                        eyebrow="Auditoria"
                        title="Histórico"
                        description="Solicitações de refresh e falhas."
                        actions={<IconAction label="Recarregar histórico" icon={RefreshCw} onClick={fetchLogs} disabled={isLoadingLogs} className={cn(isLoadingLogs && '[&_svg]:animate-spin')} />}
                    />
                    <div className="border-t px-5 py-5 md:px-6">
                        {isLoadingLogs ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                <LoaderCircle className="size-4 animate-spin text-gold" />
                                Carregando histórico…
                            </div>
                        ) : logs.length === 0 ? (
                            <EmptyState compact icon={CircleCheck} title="Nenhum registro ainda" description="As solicitações de atualização aparecem aqui." />
                        ) : (
                            <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-border">
                                {paginatedLogs.map((log) => {
                                    const isError = log.event_type === 'job_error'
                                    const details = typeof log.details === 'object' && log.details !== null ? log.details as Record<string, unknown> : {}
                                    const dashboardName = details.dashboard as string | undefined
                                    const errorMsg = details.error as string | undefined

                                    return (
                                        <li key={log.id} className="relative flex gap-3.5">
                                            <span
                                                className={cn(
                                                    "relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border bg-card",
                                                    isError ? "border-danger/40 text-danger" : "border-gold/50 text-gold"
                                                )}
                                            >
                                                {isError ? <CircleAlert className="size-3.5" /> : <CircleCheck className="size-3.5" />}
                                            </span>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                                    <p className="text-sm font-semibold text-foreground">
                                                        {isError ? 'Falha' : 'Solicitado'}
                                                        {dashboardName && <span className="font-normal text-muted-foreground"> · {dashboardName}</span>}
                                                    </p>
                                                    <span className="text-xs text-faint tabular-nums">{formatWhen(log.created_at)}</span>
                                                </div>
                                                {errorMsg && (
                                                    <p className="break-words rounded-[4px] bg-danger/[0.06] px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed text-danger">
                                                        {errorMsg}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    )
                                })}
                            </ol>
                        )}
                    </div>
                    <PaginationBar
                        page={logsPage}
                        totalPages={logsTotalPages}
                        onPrev={() => setLogsPage(p => Math.max(1, p - 1))}
                        onNext={() => setLogsPage(p => Math.min(logsTotalPages, p + 1))}
                    />
                </Panel>
            </div>
        </div>
    )
}
