'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type AutomationLog } from '@/app/actions/automation'
import { Activity, Info, CheckCircle, XCircle } from 'lucide-react'

interface LogListProps {
    logs?: AutomationLog[]
    error?: string
}

function getIcon(type: string) {
    if (type.includes('error')) return <XCircle className="h-4 w-4 text-danger" />
    if (type.includes('success') || type.includes('sent')) return <CheckCircle className="h-4 w-4 text-success" />
    if (type.includes('start')) return <Activity className="h-4 w-4 text-info" />
    return <Info className="h-4 w-4 text-muted-foreground" />
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('pt-BR')
}

export function LogList({ logs, error }: LogListProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-gold" />
                    Histórico de Execução
                </CardTitle>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-danger">Erro: {error}</p>
                ) : (
                    <div className="overflow-hidden rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[180px]">Data/Hora</TableHead>
                                    <TableHead className="w-[150px]">Tipo</TableHead>
                                    <TableHead>Detalhes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs?.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-muted-foreground text-sm font-mono">
                                            {formatDate(log.created_at)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getIcon(log.event_type)}
                                                <span className="capitalize text-sm font-medium">
                                                    {log.event_type.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground bg-muted p-2 rounded">
                                                {JSON.stringify(log.details, null, 2)}
                                            </pre>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {logs?.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                            Nenhum log registrado recentemente.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
