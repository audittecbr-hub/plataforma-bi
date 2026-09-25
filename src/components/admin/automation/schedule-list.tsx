'use client'

import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { DestructiveConfirm, IconAction } from '@/components/admin/admin-ui'
import { ScheduleDialog } from './schedule-dialog'
import { CalendarClock, CircleAlert, Play, Trash2, Users } from 'lucide-react'
import { deleteSchedule, triggerAutomation, type AutomationSchedule, type AutomationDefinition, type AutomationContact, type AutomationTemplate } from '@/app/actions/automation'
import { toast } from "sonner"
import { useRealtimeQueue } from '@/hooks/use-realtime-queue'
import { cn } from '@/lib/utils'

interface ScheduleListProps {
    schedules?: AutomationSchedule[]
    definitions?: AutomationDefinition[]
    contacts?: AutomationContact[]
    templates?: AutomationTemplate[]
    error?: string
}

// 0 = domingo
const DAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function formatDays(days: number[] | null) {
    if (!days || days.length === 0) return 'Nenhum dia'
    return days.map(d => DAY_NAMES[d]).join(', ')
}

/** Semana em sete marcadores; os dias ativos ficam preenchidos. */
function WeekDots({ days }: { days: number[] | null }) {
    return (
        <div className="flex gap-1" aria-label={formatDays(days)} title={formatDays(days)}>
            {DAY_LETTERS.map((letter, i) => {
                const on = !!days?.includes(i)
                return (
                    <span
                        key={i}
                        aria-hidden
                        className={cn(
                            "grid size-5 place-items-center rounded-full text-[9.5px] font-bold",
                            on ? "bg-ink text-white dark:bg-white dark:text-ink" : "bg-muted text-faint"
                        )}
                    >
                        {letter}
                    </span>
                )
            })}
        </div>
    )
}

export function ScheduleList({ schedules, definitions = [], contacts = [], templates = [], error }: ScheduleListProps) {

    const { jobs } = useRealtimeQueue()

    async function handleDelete(id: string) {
        toast.promise(
            deleteSchedule(id),
            {
                loading: 'Excluindo agendamento...',
                success: 'Agendamento excluído com sucesso!',
                error: (err) => `Erro ao excluir: ${err.message}`
            }
        )
    }

    async function handleTrigger(id: string, name: string) {
        toast.promise(
            triggerAutomation(id),
            {
                loading: 'Iniciando automação...',
                success: () => `Automação '${name}' iniciada!`,
                error: (err) => `Erro ao iniciar: ${err.message}`
            }
        )
    }

    // Status em tempo real da fila; sem job recente, mostra ativo/inativo
    const getStatusBadge = (schedule: AutomationSchedule) => {
        const job = jobs[schedule.id]
        switch (job?.status) {
            case 'pending':
                return <Badge variant="warning" dot>Na fila</Badge>
            case 'processing':
                return <Badge variant="info" dot pulse>Executando</Badge>
            case 'completed':
                return <Badge variant="success" dot>Concluído</Badge>
            case 'failed':
                return <Badge variant="danger" dot>Erro</Badge>
            default:
                return schedule.active
                    ? <Badge variant="gold" dot>Ativo</Badge>
                    : <Badge variant="outline">Inativo</Badge>
        }
    }

    const actions = (s: AutomationSchedule) => (
        <div className="flex items-center justify-end gap-0.5">
            <IconAction label="Executar agora" icon={Play} tone="success" onClick={() => handleTrigger(s.id, s.name)} />
            <ScheduleDialog scheduleToEdit={s} definitions={definitions} contacts={contacts} templates={templates} />
            <DestructiveConfirm
                trigger={<IconAction label="Excluir agendamento" icon={Trash2} tone="danger" />}
                title="Excluir agendamento?"
                description={<>Você tem certeza que deseja excluir <span className="font-semibold text-foreground">{s.name}</span>?</>}
                onConfirm={() => handleDelete(s.id)}
            />
        </div>
    )

    return (
        <Panel>
            <PanelHeader
                icon={CalendarClock}
                eyebrow="Automação"
                title="Agendamentos"
                description="Relatórios enviados automaticamente por horário e dia da semana."
                actions={<ScheduleDialog definitions={definitions} contacts={contacts} templates={templates} />}
            />

            {error ? (
                <EmptyState compact icon={CircleAlert} title="Não foi possível carregar os agendamentos" description={error} />
            ) : !schedules?.length ? (
                <EmptyState compact icon={CalendarClock} title="Nenhum agendamento" description="Crie a primeira automação de envio." />
            ) : (
                <>
                    {/* Mobile */}
                    <ul className="divide-y border-t md:hidden">
                        {schedules.map((s) => (
                            <li key={s.id} className="space-y-3 px-5 py-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                                        <p className="truncate text-[13px] text-muted-foreground">{s.definition?.name}</p>
                                    </div>
                                    {getStatusBadge(s)}
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-lg font-extrabold tabular-nums tracking-[-0.01em] text-foreground">{s.scheduled_time?.slice(0, 5)}</span>
                                    <WeekDots days={s.days_of_week} />
                                </div>
                                {jobs[s.id]?.status === 'failed' && (
                                    <p className="rounded-[4px] bg-danger/[0.06] px-2.5 py-1.5 font-mono text-xs text-danger">
                                        {jobs[s.id].logs?.slice(0, 100)}…
                                    </p>
                                )}
                                <div className="flex items-center justify-between border-t pt-2">
                                    <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                        <Users className="size-3.5" /> {s.recipients?.length || 0} destinatários
                                    </span>
                                    {actions(s)}
                                </div>
                            </li>
                        ))}
                    </ul>

                    {/* Desktop */}
                    <div className="hidden border-t md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Automação</TableHead>
                                    <TableHead>Horário</TableHead>
                                    <TableHead>Dias</TableHead>
                                    <TableHead>Destinatários</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {schedules.map((s) => (
                                    <TableRow key={s.id}>
                                        <TableCell className="max-w-[320px]">
                                            <p className="truncate font-semibold text-foreground">{s.name}</p>
                                            <p className="truncate text-[13px] text-muted-foreground">{s.definition?.name}</p>
                                            {/* Show Logs Preview if failed */}
                                            {jobs[s.id]?.status === 'failed' && (
                                                <p className="mt-1 max-w-[280px] truncate font-mono text-xs text-danger" title={jobs[s.id].logs || ''}>
                                                    Erro: {jobs[s.id].logs}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-base font-extrabold tabular-nums tracking-[-0.01em] text-foreground">{s.scheduled_time?.slice(0, 5)}</span>
                                        </TableCell>
                                        <TableCell>
                                            <WeekDots days={s.days_of_week} />
                                        </TableCell>
                                        <TableCell>
                                            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
                                                <Users className="size-3.5" /> {s.recipients?.length || 0}
                                            </span>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(s)}</TableCell>
                                        <TableCell className="text-right">{actions(s)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}
        </Panel>
    )
}
