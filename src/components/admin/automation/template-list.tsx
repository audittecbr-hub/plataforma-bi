'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TemplateDialog } from './template-dialog'
import { Trash2, MessageSquareText } from 'lucide-react'
import { deleteTemplate, type AutomationTemplate } from '@/app/actions/automation'
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

interface TemplateListProps {
    templates?: AutomationTemplate[]
    error?: string
}

export function TemplateList({ templates, error }: TemplateListProps) {
    const router = useRouter()

    async function handleDelete(id: string) {
        const res = await deleteTemplate(id)
        if (res.success) {
            toast.success("Template removido com sucesso")
            router.refresh()
        } else {
            toast.error("Erro ao remover: " + res.error)
        }
    }

    return (
        <Card className="border-none bg-card/50 mt-4">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                <CardTitle className="flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5 text-[#D5AE77]" />
                    Templates de Mensagem
                </CardTitle>
                <TemplateDialog />
            </CardHeader>
            <CardContent>
                {error ? (
                    <p className="text-red-500">Erro: {error}</p>
                ) : (
                    <div className="space-y-4">
                        {/* Mobile View */}
                        <div className="grid grid-cols-1 gap-4 md:hidden">
                            {templates?.map((t) => (
                                <div key={t.id} className="flex flex-col space-y-3 rounded-lg border bg-card p-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="font-medium">{t.name}</div>
                                    </div>
                                    <div className="text-sm text-muted-foreground truncate line-clamp-2 bg-black/20 p-2 rounded font-mono">
                                        {t.content}
                                    </div>
                                    
                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D5AE77]/10">
                                         <TemplateDialog templateToEdit={t} />
                                         <DeleteConfirm id={t.id} onDelete={handleDelete} name={t.name} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop View */}
                        <div className="hidden md:block overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">Nome</TableHead>
                                        <TableHead>Conteúdo (Preview)</TableHead>
                                        <TableHead className="text-right w-[100px]">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {templates?.map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell className="font-medium">{t.name}</TableCell>
                                            <TableCell className="max-w-[400px]">
                                                <div className="truncate font-mono text-xs text-gray-400">
                                                    {t.content}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right flex items-center justify-end gap-2">
                                                <TemplateDialog templateToEdit={t} />
                                                <DeleteConfirm id={t.id} onDelete={handleDelete} name={t.name} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {templates?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                                                Nenhum template cadastrado.
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
            <AlertDialogContent className="bg-[#322E2B] text-white border-[#D5AE77]/20">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-[#D5AE77]">Excluir Template?</AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-400">
                        Você tem certeza que deseja excluir <b>{name}</b>?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="bg-transparent border-gray-600 hover:bg-white/10 text-white">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(id)} className="bg-red-600 hover:bg-red-700 text-white border-none">
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
