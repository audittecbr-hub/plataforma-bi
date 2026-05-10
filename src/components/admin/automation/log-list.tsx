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
    if (type.includes('error')) return <XCircle className="h-4 w-4 text-red-500" />
    if (type.includes('success') || type.includes('sent')) return <CheckCircle className="h-4 w-4 text-green-500" />
    if (type.includes('start')) return <Activity className="h-4 w-4 text-blue-500" />
    return <Info className="h-4 w-4 text-gray-500" />
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('pt-BR')
}

export function LogList({ logs, error }: LogListProps) {
    return (
        <Card className="border-none bg-card/50 mt-4">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#D5AE77]" />
                    Histórico de Execução
                </CardTitle>
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-red-500">Erro: {error}</p>
                ) : (
                    <div className="rounded-md border border-[#D5AE77]/20">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-muted/50 border-[#D5AE77]/20">
                                    <TableHead className="w-[180px]">Data/Hora</TableHead>
                                    <TableHead className="w-[150px]">Tipo</TableHead>
                                    <TableHead>Detalhes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs?.map((log) => (
                                    <TableRow key={log.id} className="hover:bg-muted/50 border-[#D5AE77]/10">
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
