'use client'

import { useActionState } from 'react'
import { resetPassword } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-primary-foreground font-semibold" disabled={pending}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Redefinir Senha
    </Button>
  )
}

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPassword, null)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1c1917] p-4 text-white">
        <Card className="w-[400px] border-none bg-card text-card-foreground shadow-2xl bg-[#322E2B]">
        <CardHeader>
            <CardTitle className="text-2xl text-center text-[#D5AE77]">Nova Senha</CardTitle>
            <CardDescription className="text-center text-gray-400">
            Defina sua nova senha para acessar o portal.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <form action={formAction} className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
                <Label htmlFor="password" className="text-[#D5AE77]">Nova Senha</Label>
                <Input id="password" name="password" type="password" className="bg-background/50 border-gray-600 text-white" required />
            </div>
            <div className="flex flex-col space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-[#D5AE77]">Confirmar Senha</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" className="bg-background/50 border-gray-600 text-white" required />
            </div>
            {state?.error && (
                <p className="text-sm text-red-500 text-center font-medium bg-red-500/10 p-2 rounded">{state.error}</p>
            )}
            <SubmitButton />
            </form>
        </CardContent>
        </Card>
    </div>
  )
}
