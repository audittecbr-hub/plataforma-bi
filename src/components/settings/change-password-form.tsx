'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { updatePassword } from '../../app/dashboard/settings/actions'

function PasswordInput({ id, name, label, required = false, minLength }: { id: string, name: string, label: string, required?: boolean, minLength?: number }) {
    const [show, setShow] = useState(false)
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
                <Input 
                    id={id} 
                    name={name} 
                    type={show ? "text" : "password"} 
                    required={required}
                    minLength={minLength}
                    className="bg-background border-input pr-10"
                />
                <button 
                    type="button" 
                    onClick={() => setShow(!show)} 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        </div>
    )
}

export function ChangePasswordForm() {
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setMessage(null)

        const oldPassword = formData.get('oldPassword') as string
        const newPassword = formData.get('newPassword') as string
        const confirmPassword = formData.get('confirmPassword') as string

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'As novas senhas não coincidem.' })
            setIsLoading(false)
            return
        }

        if (newPassword.length < 6) {
             setMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' })
             setIsLoading(false)
             return
        }

        const result = await updatePassword(oldPassword, newPassword)

        if (result.success) {
            setMessage({ type: 'success', text: 'Senha alterada com sucesso!' })
            // Reset form manually or via key
            const form = document.getElementById('change-password-form') as HTMLFormElement
            form?.reset()
        } else {
            setMessage({ type: 'error', text: result.error || 'Erro ao alterar senha.' })
        }

        setIsLoading(false)
    }

    return (
        <Card className="border-none bg-card/50 mt-6">
            <CardHeader>
                <CardTitle>Segurança</CardTitle>
                <CardDescription>
                    Atualize sua senha de acesso.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form id="change-password-form" action={handleSubmit} className="space-y-4 max-w-md">
                    {message && (
                        <div className={`p-3 rounded-md flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                            <span>{message.text}</span>
                        </div>
                    )}

                    <PasswordInput id="oldPassword" name="oldPassword" label="Senha Atual" required />
                    <PasswordInput id="newPassword" name="newPassword" label="Nova Senha" required minLength={6} />
                    <PasswordInput id="confirmPassword" name="confirmPassword" label="Confirmar Nova Senha" required minLength={6} />

                    <Button type="submit" className="w-full bg-[#D5AE77] hover:bg-[#D5AE77]/90 text-black font-bold" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Alterar Senha'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
