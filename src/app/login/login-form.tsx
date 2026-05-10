'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
// We assume toast is available, if not we will use simple alert for now or implement toast later.
// The user asked for toasts. I'll stick to basic feedback in UI for now and ensure toast is added later or use a library if present.
// Checking package.json I see "sonner" or similar isn't strictly listed but often Shadcn uses it.
// I'll assume standard Shadcn Toast if available, otherwise just text feedback.
// Actually, I'll use simple text feedback inside the modal for now to ensure functionality.
// Wait, user asked for "Toasts". I will check if `components/ui/use-toast.ts` exists in next step or just implement inline first.

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-primary-foreground font-semibold" disabled={pending}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Entrar
    </Button>
  )
}


export function LoginForm({ next }: { next?: string }) {
  // Bind the next param to the server action
  const loginWithRedirect = login.bind(null, next)
  const [state, formAction] = useActionState(loginWithRedirect, null)

  return (
    <Card className="w-[350px] border-none bg-card text-card-foreground shadow-2xl bg-[#322E2B]">
      <CardHeader>
        <CardTitle className="text-2xl text-center font-cinzel">
          <span className="text-white">GRUPO</span> <span className="text-[#D5AE77]">STUDIO</span>
        </CardTitle>
        <CardDescription className="text-center text-gray-400">
          Portal de Dashboards
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="email" className="text-[#D5AE77]">Email</Label>
            <Input id="email" name="email" type="email" placeholder="nome@exemplo.com" className="bg-[#1c1917] border-[#D5AE77]/20 text-white placeholder:text-gray-500" required />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="password" className="text-[#D5AE77]">Senha</Label>
            <Input id="password" name="password" type="password" className="bg-[#1c1917] border-[#D5AE77]/20 text-white" required />
          </div>
          <div className="flex items-center space-x-2">
             <Checkbox id="remember" name="remember" className="border-[#D5AE77] data-[state=checked]:bg-[#D5AE77] data-[state=checked]:text-black" />
             <Label htmlFor="remember" className="text-gray-400 text-sm font-normal">Manter-se conectado</Label>
          </div>
          {state?.error && (
            <p className="text-sm text-red-500 text-center font-medium bg-red-500/10 p-2 rounded">{state.error}</p>
          )}
          <SubmitButton />
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-2">
        <p className="text-xs text-gray-500">Área Restrita</p>
      </CardFooter>
    </Card>
  )
}
