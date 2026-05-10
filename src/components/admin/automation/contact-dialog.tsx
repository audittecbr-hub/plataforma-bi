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
import { Plus, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { manageContact, type AutomationContact } from '@/app/actions/automation'

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
             <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Editar</span>
                <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-primary-foreground">
                <Plus className="mr-2 h-4 w-4" /> Adicionar Contato
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[425px] bg-card text-foreground border-[#D5AE77]/20 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[#D5AE77]">{isEditing ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Gerencie os detalhes do contato para automação.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-foreground">Nome</Label>
            <Input id="name" name="name" defaultValue={contactToEdit?.name || ''} className="bg-background border-input text-foreground" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone" className="text-foreground">Telefone (Whatsapp)</Label>
            <Input id="phone" name="phone" placeholder="ex: 555199999999" defaultValue={contactToEdit?.phone || ''} className="bg-background border-input text-foreground" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-foreground">E-mail</Label>
            <Input id="email" name="email" type="email" defaultValue={contactToEdit?.email || ''} className="bg-background border-input text-foreground" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="department" className="text-foreground">Departamento (Grupo de Envio)</Label>
            <Select name="department" defaultValue={contactToEdit?.department || 'geral'}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecione um departamento" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border text-foreground">
                <SelectItem value="geral">Diretoria</SelectItem>
                <SelectItem value="expansao">Expansão</SelectItem>
                <SelectItem value="franchising">Franchising</SelectItem>
                <SelectItem value="educacao">Educação</SelectItem>
                <SelectItem value="tax">Tax</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="tecnologia">Tecnologia</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center space-x-2 py-2">
            <Switch id="active" name="active" defaultChecked={contactToEdit?.active ?? true} />
            <Label htmlFor="active" className="text-foreground">Ativo</Label>
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
