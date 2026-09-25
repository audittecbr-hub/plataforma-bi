'use client'

import { useRef, useState } from 'react'
import { LoaderCircle, MessageSquareText, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { IconBadge } from '@/components/ui/icon-badge'
import { Hint } from '@/components/ui/tooltip'
import { IconAction } from '@/components/admin/admin-ui'
import { TEMPLATE_VARIABLES } from './template-variables'
import { useRouter } from 'next/navigation'
import { manageTemplate, type AutomationTemplate } from '@/app/actions/automation'

interface TemplateDialogProps {
  templateToEdit?: AutomationTemplate
  trigger?: React.ReactNode
}

export function TemplateDialog({ templateToEdit, trigger }: TemplateDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!templateToEdit
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setErrorMessage(null)

    if (isEditing && templateToEdit) {
        formData.append('id', templateToEdit.id)
    }

    const result = await manageTemplate(formData)

    if (result.success) {
      setOpen(false)
      toast.success(isEditing ? 'Template atualizado' : 'Template criado')
      router.refresh()
    } else {
      setErrorMessage(result.error || 'Operação falhou')
    }
    setIsLoading(false)
  }

  /** Insere a variável onde está o cursor (o textarea continua não controlado). */
  function insertVariable(token: string) {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    el.setRangeText(token, start, end, 'end')
    el.focus()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? trigger : (
          isEditing ? (
            <IconAction label="Editar template" icon={Pencil} />
          ) : (
            <Button>
                <Plus /> Novo template
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="flex-row items-start gap-4 space-y-0">
          <IconBadge icon={MessageSquareText} />
          <div className="space-y-1.5">
            <DialogTitle>{isEditing ? 'Editar template' : 'Novo template'}</DialogTitle>
            <DialogDescription>
              Modelos de mensagem para usar nas automações.
            </DialogDescription>
          </div>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome do template</Label>
            <Input
                id="name"
                name="name"
                defaultValue={templateToEdit?.name || ''}
                placeholder="Ex.: Bom dia metas"
                required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="content">Conteúdo da mensagem</Label>
            <Textarea
                ref={contentRef}
                id="content"
                name="content"
                defaultValue={templateToEdit?.content || ''}
                placeholder="Olá {nome}, seu relatório de {data} está pronto..."
                className="min-h-[160px] font-mono text-[13px]"
                required
            />
            <div className="space-y-2 pt-1">
                <p className="eyebrow text-[10px] text-gold-text">Variáveis — clique para inserir</p>
                <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map((v) => (
                        <Hint key={v.token} label={v.description}>
                            <button
                                type="button"
                                onClick={() => insertVariable(v.token)}
                                className="rounded-[3px] border border-transparent bg-gold-wash px-2 py-1 font-mono text-xs font-medium text-gold-text outline-none transition-colors hover:border-gold/40 focus-visible:ring-[3px] focus-visible:ring-ring/25"
                            >
                                {v.token}
                            </button>
                        </Hint>
                    ))}
                </div>
            </div>
          </div>

          {errorMessage && (
            <p role="alert" className="rounded-[4px] border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
              {errorMessage}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
                {isLoading && <LoaderCircle className="animate-spin" />}
                {isLoading ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
