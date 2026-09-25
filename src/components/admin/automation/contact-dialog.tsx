'use client'

import { useState } from 'react'
import { Contact, LoaderCircle, Pencil, Plus } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { IconBadge } from '@/components/ui/icon-badge'
import { IconAction } from '@/components/admin/admin-ui'
import { useRouter } from 'next/navigation'
import { manageContact, type AutomationContact } from '@/app/actions/automation'
import { CONTACT_DEPARTMENTS } from '@/lib/department-meta'

interface ContactDialogProps {
  contactToEdit?: AutomationContact
  trigger?: React.ReactNode
}

export function ContactDialog({ contactToEdit, trigger }: ContactDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!contactToEdit
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setErrorMessage(null)

    if (isEditing && contactToEdit) {
        formData.append('id', contactToEdit.id)
    }

    const result = await manageContact(formData)

    if (result.success) {
      setOpen(false)
      toast.success(isEditing ? 'Contato atualizado' : 'Contato criado')
      // Small timeout to allow DB processing or just rely on router refresh
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
            <IconAction label="Editar contato" icon={Pencil} />
          ) : (
            <Button>
                <Plus /> Adicionar contato
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-4 space-y-0">
          <IconBadge icon={Contact} />
          <div className="space-y-1.5">
            <DialogTitle>{isEditing ? 'Editar contato' : 'Novo contato'}</DialogTitle>
            <DialogDescription>
              Dados de quem recebe os relatórios automáticos.
            </DialogDescription>
          </div>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" defaultValue={contactToEdit?.name || ''} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Telefone (WhatsApp)</Label>
            <Input id="phone" name="phone" placeholder="Ex.: 555199999999" defaultValue={contactToEdit?.phone || ''} inputMode="tel" className="tabular-nums" />
            <p className="text-xs text-muted-foreground">Com código do país e DDD, só números.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" defaultValue={contactToEdit?.email || ''} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="department">Departamento (grupo de envio)</Label>
            <Select name="department" defaultValue={contactToEdit?.department || 'geral'}>
              <SelectTrigger id="department" className="w-full">
                <SelectValue placeholder="Selecione um departamento" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_DEPARTMENTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label htmlFor="active" className="flex cursor-pointer items-center justify-between gap-4 border-t pt-4">
            <span className="text-[13px] font-semibold text-foreground">Contato ativo</span>
            <Switch id="active" name="active" defaultChecked={contactToEdit?.active ?? true} />
          </label>

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
