'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, CircleAlert, LoaderCircle, Mail } from 'lucide-react'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { PasswordInput } from '@/components/ui/password-input'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="lg" className="group w-full" disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" /> : null}
      {pending ? 'Entrando…' : 'Entrar no portal'}
      {!pending && <ArrowRight className="transition-transform duration-200 ease-out-brand group-hover:translate-x-[3px]" />}
    </Button>
  )
}

export function LoginForm({ next }: { next?: string }) {
  // Bind the next param to the server action
  const loginWithRedirect = login.bind(null, next)
  const [state, formAction] = useActionState(loginWithRedirect, null)

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="eyebrow flex items-center gap-3 text-gold-text">
          <span aria-hidden className="h-[3px] w-8 bg-gold" />
          Área restrita
        </p>
        <h2 className="text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">Acesse sua conta</h2>
        <p className="text-[15px] text-muted-foreground">Entre com seu e-mail corporativo e sua senha.</p>
      </div>

      <form action={formAction} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail corporativo</Label>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="nome@grupostudio.com.br"
              autoComplete="email"
              required
              className="h-12 pl-10 text-[15px]"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Senha</Label>
          <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-12 text-[15px]" />
        </div>

        <label htmlFor="remember" className="flex w-fit cursor-pointer items-center gap-2.5">
          <Checkbox id="remember" name="remember" />
          <span className="text-sm text-muted-foreground">Manter-me conectado</span>
        </label>

        {state?.error && (
          <div
            key={state.error}
            role="alert"
            className="flex animate-rise items-start gap-2.5 rounded-[4px] border border-danger/25 bg-danger/[0.07] px-3.5 py-3 text-sm text-danger"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        <SubmitButton />
      </form>

      <p className="border-t pt-6 text-[13px] leading-relaxed text-muted-foreground">
        Problemas para acessar? Fale com o administrador do portal.
      </p>
    </div>
  )
}
