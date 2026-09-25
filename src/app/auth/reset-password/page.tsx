import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from './reset-password-form'

export const metadata = { title: 'Nova senha' }

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  )
}
