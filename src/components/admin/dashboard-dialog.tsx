'use client'

import { useState } from 'react'
import { LayoutDashboard, LoaderCircle, Pencil, Plus } from 'lucide-react'
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
import { IconBadge } from '@/components/ui/icon-badge'
import { CheckOption, FormSection, IconAction } from '@/components/admin/admin-ui'
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
      toast.success(isEditing ? 'Dashboard atualizado' : 'Dashboard criado')
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
          <IconAction label="Editar dashboard" icon={Pencil} />
        ) : (
          <Button>
            <Plus /> Adicionar dashboard
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex-row items-start gap-4 space-y-0">
          <IconBadge icon={LayoutDashboard} />
          <div className="space-y-1.5">
            <DialogTitle>{isEditing ? 'Editar dashboard' : 'Novo dashboard'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Atualize o link e a visibilidade do relatório.' : 'Publique um relatório do Power BI no portal.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={handleSubmit} className="grid gap-6">
          <FormSection title="Relatório">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" defaultValue={dashboardToEdit?.name || ''} placeholder="Ex.: Geral (Metas)" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="embedUrl">URL de incorporação</Label>
              <Input id="embedUrl" name="embedUrl" defaultValue={dashboardToEdit?.embed_url || ''} placeholder="https://app.powerbi.com/..." className="font-mono text-[13px]" required />
              <p className="text-xs text-muted-foreground">Link &quot;Publicar na Web&quot; do Power BI.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="department">Departamento (visibilidade)</Label>
              <Select name="department" defaultValue={dashboardToEdit?.department || 'Diretoria'}>
                <SelectTrigger id="department" className="w-full">
                  <SelectValue placeholder="Selecione a área" />
                </SelectTrigger>
                <SelectContent>
                  {SUB_DEPARTMENTS.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormSection>

          <FormSection
            title="Metas líderes"
            description={
              <>
                Com um sub-grupo, o dashboard pertence <strong className="font-semibold text-foreground">exclusivamente</strong> à aba
                &quot;Metas Líderes&quot;, nessa categoria. Com um usuário, só a Diretoria, ele e o gestor direto têm acesso.
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="subGroup">Sub-grupo</Label>
                <Select name="subGroup" defaultValue={dashboardToEdit?.sub_group || 'none'}>
                  <SelectTrigger id="subGroup" className="w-full">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {SELECTABLE_DEPARTMENTS.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assignedUserId">Usuário do dashboard</Label>
                <Select name="assignedUserId" defaultValue={dashboardToEdit?.assigned_user_id || 'none'}>
                  <SelectTrigger id="assignedUserId" className="w-full">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (por departamento)</SelectItem>
                    {allUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection title="Visibilidade adicional" description="Outros departamentos que também veem este dashboard.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SELECTABLE_DEPARTMENTS.map((dept) => (
                    <CheckOption key={dept} htmlFor={`perm-${dept}`}>
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
                        <span className="truncate">{dept}</span>
                    </CheckOption>
                ))}
            </div>
            <input type="hidden" name="allowedDepartments" value={allowedDepts.join(',')} />
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
              {isLoading ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar dashboard'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
