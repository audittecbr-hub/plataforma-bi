'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import { resetPassword } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput, PasswordStrengthMeter } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <LoaderCircle className="animate-spin" />}
      {pending ? 'Salvando…' : 'Redefinir senha'}
    </Button>
  )
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPassword, null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const matches = confirm.length > 0 && confirm === password

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="eyebrow flex items-center gap-3 text-gold-text">
          <span aria-hidden className="h-[3px] w-8 bg-gold" />
          Segurança
        </p>
        <h2 className="text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">Defina sua nova senha</h2>
        <p className="text-[15px] text-muted-foreground">Por segurança, crie uma senha só sua antes de continuar para o portal.</p>
      </div>

      <form action={formAction} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="password">Nova senha</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 text-[15px]"
          />
          <PasswordStrengthMeter value={password} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-12 text-[15px]"
          />
          {confirm.length > 0 && (
            <p className={cn('flex items-center gap-1.5 text-xs font-medium', matches ? 'text-success' : 'text-muted-foreground')}>
              {matches && <Check className="size-3.5" />}
              {matches ? 'As senhas coincidem.' : 'As senhas ainda não coincidem.'}
            </p>
          )}
        </div>

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
    </div>
  )
}
