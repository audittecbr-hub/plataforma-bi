'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DestructiveConfirm, IconAction } from '@/components/admin/admin-ui'

interface DeleteConfirmationProps {
  id: string
  itemType: string
  /** Nome exibido na confirmação (opcional). */
  itemName?: string | null
  deleteAction: (id: string) => Promise<{ success: boolean; error?: string }>
}

export function DeleteConfirmation({ id, itemType, itemName, deleteAction }: DeleteConfirmationProps) {
  const router = useRouter()
  const tipo = itemType === 'User' ? 'usuário' : 'dashboard'

  async function handleDelete() {
    const result = await deleteAction(id)

    if (result.success) {
      toast.success(itemType === 'User' ? 'Usuário excluído' : 'Dashboard excluído')
      router.refresh()
      return true
    }
    toast.error(result.error || 'Falha ao excluir')
    return false
  }

  return (
    <DestructiveConfirm
      trigger={<IconAction label={`Excluir ${tipo}`} icon={Trash2} tone="danger" />}
      title={`Excluir ${tipo}?`}
      description={
        <>
          Esta ação não pode ser desfeita.{' '}
          {itemName ? (
            <>
              <span className="font-semibold text-foreground">{itemName}</span> será removido permanentemente.
            </>
          ) : (
            <>O {tipo} será removido permanentemente.</>
          )}
        </>
      }
      onConfirm={handleDelete}
    />
  )
}
