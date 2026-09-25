'use client'

import { useRef, useState } from 'react'
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput, PasswordStrengthMeter } from '@/components/ui/password-input'
import { updatePassword } from '../../app/dashboard/settings/actions'
import { cn } from '@/lib/utils'

export function ChangePasswordForm() {
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
    const [newPassword, setNewPassword] = useState('')
    const formRef = useRef<HTMLFormElement>(null)

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setMessage(null)

        const oldPassword = formData.get('oldPassword') as string
        const newPasswordValue = formData.get('newPassword') as string
        const confirmPassword = formData.get('confirmPassword') as string

        if (newPasswordValue !== confirmPassword) {
            setMessage({ type: 'error', text: 'As novas senhas não coincidem.' })
            setIsLoading(false)
            return
        }

        if (newPasswordValue.length < 6) {
             setMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' })
             setIsLoading(false)
             return
        }

        const result = await updatePassword(oldPassword, newPasswordValue)

        if (result.success) {
            setMessage({ type: 'success', text: 'Senha alterada com sucesso!' })
            formRef.current?.reset()
            setNewPassword('')
        } else {
            setMessage({ type: 'error', text: result.error || 'Erro ao alterar senha.' })
        }

        setIsLoading(false)
    }

    return (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
            <form ref={formRef} id="change-password-form" action={handleSubmit} className="grid max-w-md gap-5">
                <div className="grid gap-2">
                    <Label htmlFor="oldPassword">Senha atual</Label>
                    <PasswordInput id="oldPassword" name="oldPassword" autoComplete="current-password" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="newPassword">Nova senha</Label>
                    <PasswordInput
                        id="newPassword"
                        name="newPassword"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <PasswordStrengthMeter value={newPassword} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                    <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required minLength={6} />
                </div>

                {message && (
                    <div
                        role={message.type === 'error' ? 'alert' : 'status'}
                        className={cn(
                            'flex items-start gap-2.5 rounded-[4px] border px-3.5 py-3 text-sm',
                            message.type === 'success'
                                ? 'border-success/25 bg-success/[0.07] text-success'
                                : 'border-danger/25 bg-danger/[0.07] text-danger'
                        )}
                    >
                        {message.type === 'success' ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
                        <span>{message.text}</span>
                    </div>
                )}

                <div>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading && <LoaderCircle className="animate-spin" />}
                        {isLoading ? 'Alterando…' : 'Alterar senha'}
                    </Button>
                </div>
            </form>
        </div>
    )
}
