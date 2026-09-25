'use client'

import { CircleAlert, MessageSquareText, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from "sonner"
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { DestructiveConfirm, IconAction } from '@/components/admin/admin-ui'
import { TemplateDialog } from './template-dialog'
import { splitTemplate } from './template-variables'
import { deleteTemplate, type AutomationTemplate } from '@/app/actions/automation'

interface TemplateListProps {
    templates?: AutomationTemplate[]
    error?: string
}

/** Prévia da mensagem com as variáveis destacadas. */
function TemplatePreview({ content }: { content: string }) {
    return (
        <p className="line-clamp-4 whitespace-pre-line text-[13.5px] leading-relaxed text-muted-foreground">
            {splitTemplate(content).map((part, i) =>
                /^\{[a-z_]+\}$/.test(part) ? (
                    <span key={i} className="rounded-[2px] bg-gold-wash px-1 py-px font-mono text-[12px] font-medium text-gold-text">
                        {part}
                    </span>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </p>
    )
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
        <Panel>
            <PanelHeader
                icon={MessageSquareText}
                eyebrow="Automação"
                title="Templates de mensagem"
                description="Textos usados nos envios automáticos, com variáveis preenchidas na hora do disparo."
                actions={<TemplateDialog />}
            />

            {error ? (
                <EmptyState compact icon={CircleAlert} title="Não foi possível carregar os templates" description={error} />
            ) : !templates?.length ? (
                <EmptyState compact icon={MessageSquareText} title="Nenhum template cadastrado" description="Crie o primeiro modelo de mensagem." />
            ) : (
                <ul className="grid gap-4 border-t p-5 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
                    {templates.map((t) => (
                        <li key={t.id} className="group relative flex flex-col gap-3 rounded-xl border bg-surface p-5 transition-shadow duration-200 hover:shadow-md">
                            <span aria-hidden className="absolute left-5 top-0 h-[3px] w-8 bg-gold" />
                            <div className="flex items-start justify-between gap-3">
                                <p className="pt-1 text-[15px] font-bold leading-snug tracking-[-0.01em] text-foreground">{t.name}</p>
                                <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-0.5">
                                    <TemplateDialog templateToEdit={t} />
                                    <DestructiveConfirm
                                        trigger={<IconAction label="Excluir template" icon={Trash2} tone="danger" />}
                                        title="Excluir template?"
                                        description={<>Você tem certeza que deseja excluir <span className="font-semibold text-foreground">{t.name}</span>?</>}
                                        onConfirm={() => handleDelete(t.id)}
                                    />
                                </div>
                            </div>
                            <TemplatePreview content={t.content} />
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}
