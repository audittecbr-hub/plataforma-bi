'use client'

import { useState } from 'react'
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
import { Plus, Pencil } from 'lucide-react'
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

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setErrorMessage(null)

    if (isEditing && templateToEdit) {
        formData.append('id', templateToEdit.id)
    }

    const result = await manageTemplate(formData)

    if (result.success) {
      setOpen(false)
      router.refresh()
    } else {
      setErrorMessage(result.error || 'Operação falhou')
    }
    setIsLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? trigger : (
          isEditing ? (
             <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Editar</span>
                <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-primary-foreground">
                <Plus className="mr-2 h-4 w-4" /> Novo Template
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[600px] bg-card text-foreground border-[#D5AE77]/20 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[#D5AE77]">{isEditing ? 'Editar Template' : 'Novo Template'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Crie templates de mensagem para usar em suas automações.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-foreground">Nome do Template</Label>
            <Input 
                id="name" 
                name="name" 
                defaultValue={templateToEdit?.name || ''} 
                placeholder="Ex: Bom dia Metas"
                className="bg-background border-input text-foreground" 
                required 
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="content" className="text-foreground">Conteúdo da Mensagem</Label>
            <Textarea 
                id="content" 
                name="content" 
                defaultValue={templateToEdit?.content || ''} 
                placeholder="Olá {nome}, seu relatório de {data} está pronto..."
                className="bg-background border-input text-foreground font-mono text-sm min-h-[150px]" 
                required 
            />
            <div className="text-xs text-muted-foreground space-y-1 mt-2">
                <p className="font-semibold text-foreground">Variáveis disponíveis:</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li><code className="text-[#D5AE77]">{'{nome}'}</code>: Primeiro nome do destinatário (ex: João)</li>
                    <li><code className="text-[#D5AE77]">{'{nome_completo}'}</code>: Nome completo do destinatário</li>
                    <li><code className="text-[#D5AE77]">{'{saudacao}'}</code>: &quot;Bom dia&quot;, &quot;Boa tarde&quot; ou &quot;Boa noite&quot; (automático)</li>
                    <li><code className="text-[#D5AE77]">{'{data}'}</code>: Data de referência do relatório ou dia atual</li>
                    <li><code className="text-[#D5AE77]">{'{data_semanal}'}</code>: Período da semana anterior (ex: 15/01/2026 a 21/01/2026)</li>
                    <li><code className="text-[#D5AE77]">{'{grupo}'}</code>: Nome do departamento ou grupo (ex: Diretoria)</li>
                </ul>
            </div>
          </div>

          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
          
          <DialogFooter>
            <Button type="submit" className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-black font-bold" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
