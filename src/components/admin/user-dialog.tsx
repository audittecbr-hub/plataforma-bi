'use client'

import { useState } from 'react'
import { KeyRound, LoaderCircle, Pencil, Plus, UserPlus, UserRound } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { IconBadge } from '@/components/ui/icon-badge'
import { CheckOption, FormSection, IconAction } from '@/components/admin/admin-ui'
import { createUser, updateUser, resetUserPassword, type AdminUser } from '@/app/dashboard/admin/actions'
import { useRouter } from 'next/navigation'
import { SELECTABLE_DEPARTMENTS } from '@/lib/constants'
import { Checkbox } from '@/components/ui/checkbox'

interface UserDialogProps {
  userToEdit?: AdminUser
  allUsers?: { id: string; name: string }[]
  onClose?: () => void
}

export function UserDialog({ userToEdit }: UserDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!userToEdit
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
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
      toast.success(isEditing ? 'Usuário atualizado' : 'Usuário criado')
      router.refresh()
    } else {
      setErrorMessage(result.error || 'Operação falhou')
    }
    setIsLoading(false)
  }

  async function handleResetPassword() {
    if (!userToEdit) return

    setIsResetting(true)
    setErrorMessage(null)

    const result = await resetUserPassword(userToEdit.id)

    if (result.success) {
      toast.success('Senha redefinida para 123456', {
        description: `${userToEdit.full_name} precisará trocá-la no próximo acesso.`,
      })
      setConfirmReset(false)
    } else {
      setErrorMessage(result.error || 'Falha ao resetar senha')
    }
    setIsResetting(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) setConfirmReset(false)
      }}
    >
      <DialogTrigger asChild>
        {isEditing ? (
          <IconAction label="Editar usuário" icon={Pencil} />
        ) : (
          <Button>
            <Plus /> Adicionar usuário
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex-row items-start gap-4 space-y-0">
          <IconBadge icon={isEditing ? UserRound : UserPlus} />
          <div className="space-y-1.5">
            <DialogTitle>{isEditing ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Atualize os dados, o departamento e as permissões da conta.' : 'Crie uma conta de acesso ao portal.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={handleSubmit} className="grid gap-6">
          <FormSection title="Identificação">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input id="fullName" name="fullName" defaultValue={userToEdit?.full_name || ''} required autoComplete="name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" defaultValue={userToEdit?.email || ''} disabled={isEditing} required autoComplete="email" />
            </div>
            {!isEditing ? (
              <div className="grid gap-2">
                <Label htmlFor="password">Senha inicial</Label>
                <Input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-[4px] border bg-[var(--gs-gray-50)] p-4 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <IconBadge icon={KeyRound} tone="neutral" size="sm" />
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Senha</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {confirmReset
                        ? 'A senha volta para "123456" e a troca passa a ser obrigatória no próximo acesso.'
                        : 'Não é editável aqui. Você pode redefini-la para o padrão.'}
                    </p>
                  </div>
                </div>
                {confirmReset ? (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmReset(false)} disabled={isResetting}>
                      Cancelar
                    </Button>
                    <Button type="button" size="sm" onClick={handleResetPassword} disabled={isResetting}>
                      {isResetting && <LoaderCircle className="animate-spin" />}
                      Confirmar
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)} className="shrink-0">
                    Redefinir senha
                  </Button>
                )}
              </div>
            )}
          </FormSection>

          <FormSection title="Acesso" description="O departamento principal define os dashboards padrão; as áreas extras somam permissões.">
            <div className="grid gap-2">
              <Label htmlFor="department">Departamento principal</Label>
              <Select name="department" defaultValue={userToEdit?.department || 'Diretoria'}>
                <SelectTrigger id="department" className="w-full">
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
              <div className="flex items-baseline justify-between gap-3">
                <Label>Permissões adicionais</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {selectedPermissions.length} {selectedPermissions.length === 1 ? 'selecionada' : 'selecionadas'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SELECTABLE_DEPARTMENTS.map((dept) => (
                      <CheckOption key={dept} htmlFor={`perm-${dept}`}>
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
                          <span className="truncate">{dept}</span>
                      </CheckOption>
                  ))}
              </div>
              <input type="hidden" name="allowedSubDepartments" value={selectedPermissions.join(',')} />
            </div>
          </FormSection>

          <FormSection title="Papéis">
            <label htmlFor="isLeader" className="flex cursor-pointer items-start justify-between gap-4">
              <span className="space-y-0.5">
                <span className="block text-[13px] font-semibold text-foreground">Líder de equipe</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">Visualiza todos os dashboards individuais do seu setor.</span>
              </span>
              <Switch id="isLeader" name="isLeader" defaultChecked={userToEdit?.is_leader || false} />
            </label>
            <label htmlFor="isAdmin" className="flex cursor-pointer items-start justify-between gap-4">
              <span className="space-y-0.5">
                <span className="block text-[13px] font-semibold text-foreground">Administrador</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">Acesso a todas as áreas e ao painel administrativo.</span>
              </span>
              <Switch id="isAdmin" name="isAdmin" defaultChecked={userToEdit?.is_admin || false} />
            </label>
          </FormSection>

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
              {isLoading ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
