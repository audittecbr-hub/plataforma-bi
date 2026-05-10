'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface DeleteConfirmationProps {
  id: string
  itemType: string
  deleteAction: (id: string) => Promise<{ success: boolean; error?: string }>
}

export function DeleteConfirmation({ id, itemType, deleteAction }: DeleteConfirmationProps) {
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setIsDeleting(true)
    const result = await deleteAction(id)
    
    if (result.success) {
      setOpen(false)
      router.refresh()
    } else {
      alert(result.error || 'Falha ao excluir')
    }
    setIsDeleting(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-[#322E2B] border-[#D5AE77]/30 text-zinc-100 max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[#D5AE77] text-xl font-bold">Tem certeza absoluta?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Esta ação não pode ser desfeita. Isso excluirá permanentemente este {itemType === 'User' ? 'usuário' : 'dashboard'}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel className="bg-transparent border-[#D5AE77]/50 text-[#D5AE77] hover:bg-[#D5AE77]/10 hover:text-[#D5AE77] hover:border-[#D5AE77] transition-colors">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
                e.preventDefault()
                handleDelete()
            }}
            className="bg-red-600 hover:bg-red-700 text-white border-0 transition-colors focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:ring-offset-[#322E2B]"
            disabled={isDeleting}
          >
            {isDeleting ? 'Excluindo...' : 'Excluir'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
