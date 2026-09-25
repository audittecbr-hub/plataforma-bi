'use client'

import { useState } from 'react'
import { Activity, CircleAlert, Monitor, ShieldX, Smartphone } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader, PanelToolbar } from '@/components/ui/panel'
import { PaginationBar, SearchField } from '@/components/admin/admin-ui'
import type { AccessLog } from '@/app/actions/automation'
import { cn } from '@/lib/utils'

interface AccessLogListProps {
    accessLogs?: AccessLog[]
    error?: string
}

const ITEMS_PER_PAGE = 15

const FILTERS = [
    { value: 'all', label: 'Todos' },
    { value: 'login_success', label: 'Sucesso' },
    { value: 'login_failed', label: 'Falhou' },
    { value: 'blocked', label: 'Bloqueado' },
] as const

// Fuso fixo: o servidor roda em UTC e o navegador no horário local — sem isso o
// HTML do servidor e a hidratação divergem (e o admin via a hora em UTC).
const TIMEZONE = 'America/Sao_Paulo'

function formatDay(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TIMEZONE })
}

function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE })
}

/** Navegador e sistema a partir do user-agent — só para leitura humana. */
function describeDevice(ua: string | null) {
    if (!ua) return null
    const browser = /Edg\//.test(ua)
        ? 'Edge'
        : /OPR\/|Opera/.test(ua)
            ? 'Opera'
            : /Firefox\//.test(ua)
                ? 'Firefox'
                : /SamsungBrowser/.test(ua)
                    ? 'Samsung Internet'
                    : /Chrome\//.test(ua)
                        ? 'Chrome'
                        : /Safari\//.test(ua)
                            ? 'Safari'
                            : 'Navegador'
    const os = /Windows/.test(ua)
        ? 'Windows'
        : /iPhone|iPad|iPod/.test(ua)
            ? 'iOS'
            : /Android/.test(ua)
                ? 'Android'
                : /Mac OS X|Macintosh/.test(ua)
                    ? 'macOS'
                    : /Linux/.test(ua)
                        ? 'Linux'
                        : 'Sistema desconhecido'
    const mobile = /Mobile|iPhone|Android/.test(ua)
    return { label: `${browser} · ${os}`, mobile }
}

function EventBadge({ eventType }: { eventType: string }) {
    switch (eventType) {
        case 'login_success':
            return <Badge variant="success" dot>Sucesso</Badge>
        case 'login_failed':
            return <Badge variant="danger" dot>Falhou</Badge>
        case 'blocked':
            return <Badge variant="warning" dot>Bloqueado</Badge>
        default:
            return <Badge variant="outline">{eventType}</Badge>
    }
}

function Device({ ua }: { ua: string | null }) {
    const device = describeDevice(ua)
    if (!device) return <span className="text-faint">—</span>
    const Icon = device.mobile ? Smartphone : Monitor
    return (
        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground" title={ua ?? undefined}>
            <Icon className="size-4 text-faint" />
            {device.label}
        </span>
    )
}

export function AccessLogList({ accessLogs, error }: AccessLogListProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [filterType, setFilterType] = useState<string>('all')
    const [currentPage, setCurrentPage] = useState(1)

    const counts = {
        all: accessLogs?.length ?? 0,
        login_success: accessLogs?.filter((l) => l.event_type === 'login_success').length ?? 0,
        login_failed: accessLogs?.filter((l) => l.event_type === 'login_failed').length ?? 0,
        blocked: accessLogs?.filter((l) => l.event_type === 'blocked').length ?? 0,
    }
    const successRate = counts.all ? Math.round((counts.login_success / counts.all) * 100) : 0

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

    const handleSearch = (value: string) => {
        setSearchTerm(value)
        setCurrentPage(1)
    }

    const handleFilterChange = (value: string) => {
        setFilterType(value)
        setCurrentPage(1)
    }

    const goToNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1))
    const goToPrevPage = () => setCurrentPage(p => Math.max(1, p - 1))

    const stats = [
        { label: 'Eventos', value: counts.all, hint: 'Últimos registros' },
        { label: 'Sucesso', value: counts.login_success, hint: `${successRate}% das tentativas` },
        { label: 'Falhas', value: counts.login_failed, hint: 'Senha ou e-mail inválidos' },
        { label: 'Bloqueados', value: counts.blocked, hint: 'Acesso negado' },
    ]

    return (
        <div className="space-y-6">
            {!error && (
                <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {stats.map((s) => (
                        <div key={s.label} className="relative rounded-xl border bg-card p-5 shadow-xs">
                            <span aria-hidden className="absolute left-5 top-0 h-[3px] w-8 bg-gold" />
                            <dt className="eyebrow text-[10px] text-faint">{s.label}</dt>
                            <dd className="mt-2 text-[2rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-foreground">{s.value}</dd>
                            <dd className="mt-1.5 text-xs text-muted-foreground">{s.hint}</dd>
                        </div>
                    ))}
                </dl>
            )}

            <Panel>
                <PanelHeader
                    icon={Activity}
                    eyebrow="Segurança"
                    title="Logs de acesso"
                    description="Entradas no portal com resultado, dispositivo e endereço de origem."
                    actions={<span className="text-[13px] text-muted-foreground tabular-nums">{filteredLogs.length} registros</span>}
                />

                <PanelToolbar className="lg:justify-between">
                    <SearchField
                        id="busca-acessos"
                        value={searchTerm}
                        onChange={handleSearch}
                        placeholder="Pesquisar por e-mail, nome ou IP…"
                    />
                    <div role="radiogroup" aria-label="Tipo de evento" className="scrollbar-none flex gap-1 overflow-x-auto rounded-[4px] border bg-card p-1">
                        {FILTERS.map((f) => {
                            const active = filterType === f.value
                            return (
                                <button
                                    key={f.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => handleFilterChange(f.value)}
                                    className={cn(
                                        "flex shrink-0 items-center gap-2 rounded-[3px] px-3 py-1.5 text-[13px] font-semibold outline-none transition-colors duration-200",
                                        "focus-visible:ring-[3px] focus-visible:ring-ring/25",
                                        active ? "bg-ink text-white dark:bg-white dark:text-ink" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                    )}
                                >
                                    {f.label}
                                    <span className={cn("text-[11px] tabular-nums", active ? "opacity-70" : "text-faint")}>
                                        {counts[f.value]}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </PanelToolbar>

                {error ? (
                    <EmptyState compact icon={CircleAlert} title="Não foi possível carregar os logs" description={error} />
                ) : paginatedLogs.length === 0 ? (
                    <EmptyState compact icon={ShieldX} title="Nenhum log encontrado" description="Ajuste a busca ou o filtro de evento." />
                ) : (
                    <>
                        {/* Mobile */}
                        <ul className="divide-y border-t md:hidden">
                            {paginatedLogs.map((log) => (
                                <li key={log.id} className="space-y-2 px-5 py-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="truncate text-sm font-semibold text-foreground">{log.user?.full_name || log.email}</p>
                                        <EventBadge eventType={log.event_type} />
                                    </div>
                                    {log.user?.full_name && <p className="truncate text-[13px] text-muted-foreground">{log.email}</p>}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                                        <span>{formatDay(log.created_at)} · {formatTime(log.created_at)}</span>
                                        {log.ip_address && <span className="font-mono">{log.ip_address}</span>}
                                    </div>
                                    <Device ua={log.user_agent} />
                                </li>
                            ))}
                        </ul>

                        {/* Desktop */}
                        <div className="hidden border-t md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Usuário</TableHead>
                                        <TableHead>Evento</TableHead>
                                        <TableHead>Dispositivo</TableHead>
                                        <TableHead>IP</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedLogs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="tabular-nums">
                                                <p className="font-semibold text-foreground">{formatDay(log.created_at)}</p>
                                                <p className="text-xs text-muted-foreground">{formatTime(log.created_at)}</p>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={log.user?.full_name} email={log.email} size={32} />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold text-foreground">{log.user?.full_name || '—'}</p>
                                                        <p className="truncate text-[13px] text-muted-foreground">{log.email}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <EventBadge eventType={log.event_type} />
                                            </TableCell>
                                            <TableCell>
                                                <Device ua={log.user_agent} />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {log.ip_address || '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}

                <PaginationBar page={currentPage} totalPages={totalPages} onPrev={goToPrevPage} onNext={goToNextPage} />
            </Panel>
        </div>
    )
}
