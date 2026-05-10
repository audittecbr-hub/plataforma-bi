'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScheduleDialog } from './schedule-dialog'
import { Trash2, Users, Play } from 'lucide-react'
import { deleteSchedule, triggerAutomation, type AutomationSchedule, type AutomationDefinition, type AutomationContact, type AutomationTemplate } from '@/app/actions/automation'

import { Button } from '@/components/ui/button'
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

interface ScheduleListProps {
    schedules?: AutomationSchedule[]
    definitions?: AutomationDefinition[]
    contacts?: AutomationContact[]
    templates?: AutomationTemplate[]
    error?: string
}

function formatDays(days: number[] | null) {
    if (!days || days.length === 0) return 'Nenhum dia'
    // 0=Sun
    const map = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
    return days.map(d => map[d]).join(', ')
}

import { useRealtimeQueue } from '@/hooks/use-realtime-queue'
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'

// ... (existing imports)

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


    // Helper to get status UI
    const getStatusBadge = (scheduleId: string) => {
        const job = jobs[scheduleId]
        // Only show if recent (e.g. created in last 1 hour? For now just show if in state)
        if (!job) return null

        // Auto-hide completed/failed after some time? 
        // For now let's just show it.
        
        switch (job.status) {
            case 'pending':
                return <Badge variant="outline" className="text-yellow-500 border-yellow-500 gap-1"><Clock className="w-3 h-3" /> Na Fila</Badge>
            case 'processing':
                return <Badge variant="outline" className="text-blue-500 border-blue-500 gap-1 animate-pulse"><Loader2 className="w-3 h-3 animate-spin" /> Executando</Badge>
            case 'completed':
                return <Badge variant="outline" className="text-green-500 border-green-500 gap-1"><CheckCircle className="w-3 h-3" /> Concluído</Badge>
            case 'failed':
                return <Badge variant="outline" className="text-red-500 border-red-500 gap-1"><XCircle className="w-3 h-3" /> Erro</Badge>
            default:
                return null
        }
    }

    return (
        <Card className="border-none bg-card mt-4">
            {/* ... (Header) ... */}
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                <CardTitle>Agendamentos Ativos</CardTitle>
                <ScheduleDialog definitions={definitions} contacts={contacts} templates={templates} />
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-red-500">Erro: {error}</p>
                ) : (
                    <div className="space-y-4">
                        {/* Mobile View */}
                         <div className="grid grid-cols-1 gap-4 md:hidden">
                            {schedules?.map((s) => (
                                <div key={s.id} className="flex flex-col space-y-3 rounded-lg border bg-card p-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="font-medium">{s.name}</div>
                                        {/* Status Badge from Realtime */}
                                        {getStatusBadge(s.id) || (s.active ? <Badge className="bg-green-600">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>)}
                                    </div>
                                    <div className="text-sm">
                                        <span className="text-[#D5AE77] font-semibold">{s.definition?.name}</span> • {s.scheduled_time}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {formatDays(s.days_of_week)}
                                    </div>
                                    {/* Show Logs if failed */}
                                    {jobs[s.id]?.status === 'failed' && (
                                        <div className="text-xs text-red-400 bg-red-950/30 p-2 rounded">
                                            {jobs[s.id].logs?.slice(0, 100)}...
                                        </div>
                                    )}
                                    <div className="text-sm text-foreground flex items-center gap-2">
                                        <Users className="h-3 w-3" /> {s.recipients?.length || 0} destinatários
                                    </div>
                                    
                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D5AE77]/10">
                                         <Button variant="ghost" size="sm" onClick={() => handleTrigger(s.id, s.name)} className="h-8 w-8 p-0 text-green-500 hover:text-green-700 hover:bg-green-100/10" title="Executar Agora">
                                            <Play className="h-4 w-4" />
                                         </Button>
                                         <ScheduleDialog scheduleToEdit={s} definitions={definitions} contacts={contacts} templates={templates} />
                                         <DeleteConfirm id={s.id} onDelete={handleDelete} name={s.name} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop View */}
                        <div className="hidden md:block overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Horário/Dias</TableHead>
                                        <TableHead>Destinatários</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {schedules?.map((s) => (
                                        <TableRow key={s.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{s.name}</span>
                                                    {/* Show Logs Preview if failed */}
                                                    {jobs[s.id]?.status === 'failed' && (
                                                        <span className="text-xs text-red-400 max-w-[200px] truncate" title={jobs[s.id].logs || ''}>
                                                            Erro: {jobs[s.id].logs}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{s.definition?.name}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{s.scheduled_time}</span>
                                                    <span className="text-xs text-muted-foreground">{formatDays(s.days_of_week)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="gap-1">
                                                    <Users className="h-3 w-3" /> {s.recipients?.length || 0}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(s.id) || (s.active ? <Badge className="bg-green-600 hover:bg-green-700">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>)}
                                            </TableCell>
                                            <TableCell className="text-right flex items-center justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleTrigger(s.id, s.name)} className="h-8 w-8 p-0 text-green-500 hover:text-green-700 hover:bg-green-100/10" title="Executar Agora">
                                                    <Play className="h-4 w-4" />
                                                </Button>
                                                <ScheduleDialog scheduleToEdit={s} definitions={definitions} contacts={contacts} templates={templates} />
                                                <DeleteConfirm id={s.id} onDelete={handleDelete} name={s.name} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                     {schedules?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                                Nenhum agendamento ativo.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
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
                    <AlertDialogTitle className="text-[#D5AE77]">Excluir Agendamento?</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        Você tem certeza que deseja excluir <b>{name}</b>?
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
