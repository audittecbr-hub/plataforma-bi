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
import { Switch } from '@/components/ui/switch'
import { Plus } from 'lucide-react'
import { createUser, updateUser, resetUserPassword, type AdminUser } from '@/app/dashboard/admin/actions'
import { useRouter } from 'next/navigation'
import { SELECTABLE_DEPARTMENTS } from '@/lib/constants'
import { Checkbox } from '@/components/ui/checkbox'

interface UserDialogProps {
  userToEdit?: AdminUser
  allUsers?: { id: string; name: string }[]
  onClose?: () => void
}

export function UserDialog({ userToEdit, allUsers = [] }: UserDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!userToEdit
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(userToEdit?.allowed_sub_departments || [])

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setErrorMessage(null)

    const action = isEditing ? updateUser : createUser
    if (isEditing && userToEdit) {
        formData.append('id', userToEdit.id)
    }

    const result = await action(formData)

    if (result.success) {
      setOpen(false)
      router.refresh()
    } else {
      setErrorMessage(result.error || 'Operação falhou')
    }
    setIsLoading(false)
  }

  async function handleResetPassword() {
    if (!userToEdit) return
    
    const confirm = window.confirm(`Tem certeza que deseja resetar a senha de ${userToEdit.full_name}? A senha será alterada para "123456" e o usuário precisará trocá-la no próximo acesso.`)
    
    if (!confirm) return

    setIsResetting(true)
    setErrorMessage(null)

    const result = await resetUserPassword(userToEdit.id)

    if (result.success) {
      alert('Senha resetada com sucesso para 123456!')
    } else {
      setErrorMessage(result.error || 'Falha ao resetar senha')
    }
    setIsResetting(false)
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
            <Plus className="mr-2 h-4 w-4" /> Adicionar Usuário
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[425px] max-h-[90vh] overflow-y-auto bg-card text-foreground border-[#D5AE77]/20 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-[#D5AE77]">{isEditing ? 'Editar Usuário' : 'Criar Usuário'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEditing ? 'Atualize os detalhes e permissões do usuário.' : 'Adicione um novo usuário ao sistema.'}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="fullName" className="text-foreground">Nome Completo</Label>
            <Input id="fullName" name="fullName" defaultValue={userToEdit?.full_name || ''} className="bg-background border-input text-foreground" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-foreground">E-mail</Label>
            <Input id="email" name="email" type="email" defaultValue={userToEdit?.email || ''} className="bg-background border-input text-foreground" disabled={isEditing} required />
          </div>
          {!isEditing ? (
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-foreground">Senha</Label>
              <Input 
                  id="password" 
                  name="password" 
                  type="password" 
                  className="bg-background border-input text-foreground" 
                  required 
                  minLength={6}
              />
            </div>
          ) : (
            <div className="grid gap-2 p-4 border border-[#D5AE77]/20 rounded-lg bg-[#D5AE77]/5">
              <Label className="text-[#D5AE77] font-semibold text-sm">Segurança</Label>
              <p className="text-xs text-muted-foreground mb-2">A senha não pode ser alterada manualmente aqui. Use o botão abaixo para resetar para o padrão.</p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={handleResetPassword}
                disabled={isResetting}
                className="w-full border-[#D5AE77]/40 hover:bg-[#D5AE77]/10 text-[#D5AE77]"
              >
                {isResetting ? 'Resetando...' : 'Resetar Senha'}
              </Button>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="department" className="text-foreground">Departamento Principal</Label>
            <Select name="department" defaultValue={userToEdit?.department || 'Diretoria'}>
              <SelectTrigger className="bg-background border-input text-foreground">
                <SelectValue placeholder="Selecione um departamento" />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>
                        {dept}
                    </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label className="text-foreground">Permissões Adicionais (Outros Departamentos)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-input rounded-md p-3 bg-background">
                {SELECTABLE_DEPARTMENTS.map((dept) => (
                    <div key={dept} className="flex items-center space-x-2">
                        <Checkbox 
                            id={`perm-${dept}`} 
                            value={dept}
                            defaultChecked={userToEdit?.allowed_sub_departments?.includes(dept)}
                            onCheckedChange={(checked: boolean | string) => {
                                // Cast to boolean safely or handle string "indeterminate"
                                const isChecked = checked === true
                                const current = selectedPermissions
                                if (isChecked) {
                                    setSelectedPermissions([...current, dept])
                                } else {
                                    setSelectedPermissions(current.filter(p => p !== dept))
                                }
                            }}
                        />
                         <Label htmlFor={`perm-${dept}`} className="text-sm cursor-pointer text-muted-foreground">
                            {dept}
                        </Label>
                    </div>
                ))}
            </div>
            <input type="hidden" name="allowedSubDepartments" value={selectedPermissions.join(',')} />
          </div>
          
          <div className="flex items-center space-x-3 py-3 border-t mt-2 border-border/50">
            <Switch id="isLeader" name="isLeader" defaultChecked={userToEdit?.is_leader || false} />
            <div>
              <Label htmlFor="isLeader" className="text-foreground">É Líder de Equipe</Label>
              <p className="text-xs text-muted-foreground">Líderes visualizam todos os dashboards individuais do seu setor.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 py-2">
            <Switch id="isAdmin" name="isAdmin" defaultChecked={userToEdit?.is_admin || false} />
            <Label htmlFor="isAdmin" className="text-foreground">Usuário é Admin</Label>
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
