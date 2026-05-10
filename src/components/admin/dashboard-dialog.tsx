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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { manageDashboard, type Dashboard } from '@/app/dashboard/admin/actions'
import { useRouter } from 'next/navigation'
import { SUB_DEPARTMENTS, SELECTABLE_DEPARTMENTS } from '@/lib/constants'
import { Checkbox } from '@/components/ui/checkbox'

interface DashboardDialogProps {
  dashboardToEdit?: Dashboard
  allUsers?: { id: string; name: string }[]
  onClose?: () => void
}

export function DashboardDialog({ dashboardToEdit, allUsers = [] }: DashboardDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!dashboardToEdit
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [allowedDepts, setAllowedDepts] = useState<string[]>(dashboardToEdit?.allowed_departments || [])

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setErrorMessage(null)

    if (isEditing && dashboardToEdit) {
        formData.append('id', dashboardToEdit.id)
    }

    const result = await manageDashboard(formData)

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
        {isEditing ? (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Editar</span>
                ✏️
            </Button>
        ) : (
            <Button className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" /> Adicionar Dashboard
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[425px] max-h-[90vh] overflow-y-auto bg-card text-foreground border-[#D5AE77]/20 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[#D5AE77]">{isEditing ? 'Editar Dashboard' : 'Criar Dashboard'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditing ? 'Atualize link e visibilidade do dashboard.' : 'Adicione um novo dashboard ao portal.'}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-foreground">Nome</Label>
            <Input id="name" name="name" defaultValue={dashboardToEdit?.name || ''} placeholder="ex: Geral (Metas)" className="bg-background border-input text-foreground" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="department" className="text-foreground">Departamento (Visibilidade)</Label>
            <Select name="department" defaultValue={dashboardToEdit?.department || 'Diretoria'}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecione a área" />
              </SelectTrigger>
              <SelectContent>
                {SUB_DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="embedUrl" className="text-foreground">URL de Incorporação</Label>
            <Input id="embedUrl" name="embedUrl" defaultValue={dashboardToEdit?.embed_url || ''} placeholder="https://app.powerbi.com/..." className="bg-background border-input text-foreground" required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subGroup" className="text-foreground mt-4 border-t pt-4 border-border/50">Sub-grupo — Metas Líderes</Label>
            <p className="text-xs text-muted-foreground">Se preenchido, o dashboard pertence <strong>exclusivamente</strong> à aba &quot;Metas Líderes&quot; e aparece sob esta categoria. Ex: <em>Franchising</em>, <em>Tecnologia</em>.</p>
            <Select name="subGroup" defaultValue={dashboardToEdit?.sub_group || 'none'}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecione um sub-grupo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (não pertence a Metas Líderes)</SelectItem>
                {SELECTABLE_DEPARTMENTS.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="assignedUserId" className="text-foreground mt-2 border-t pt-4 border-border/50">Usuário do Dashboard (opcional)</Label>
            <p className="text-xs text-muted-foreground">Se preenchido, apenas a Diretoria, o usuário escolhido e o gestor direto dele terão acesso, sobrescrevendo a regra de departamentos.</p>
            <Select name="assignedUserId" defaultValue={dashboardToEdit?.assigned_user_id || 'none'}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecione um líder (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (Acesso por Departamento)</SelectItem>
                {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label className="text-foreground">Visibilidade Adicional (Outros Departamentos)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-input rounded-md p-3 bg-background">
                {SELECTABLE_DEPARTMENTS.map((dept) => (
                    <div key={dept} className="flex items-center space-x-2">
                        <Checkbox 
                            id={`perm-${dept}`} 
                            value={dept}
                            defaultChecked={dashboardToEdit?.allowed_departments?.includes(dept)}
                            onCheckedChange={(checked) => {
                                const isChecked = checked === true
                                if (isChecked) {
                                    setAllowedDepts([...allowedDepts, dept])
                                } else {
                                    setAllowedDepts(allowedDepts.filter(p => p !== dept))
                                }
                            }}
                        />
                         <Label htmlFor={`perm-${dept}`} className="text-sm cursor-pointer text-muted-foreground">
                            {dept}
                        </Label>
                    </div>
                ))}
            </div>
            <input type="hidden" name="allowedDepartments" value={allowedDepts.join(',')} />
          </div>
          
          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
          
          <DialogFooter>
            <Button type="submit" className="bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-black font-bold" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
