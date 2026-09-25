import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar' }

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams
  const next = searchParams.next

  return (
    <AuthShell>
      <LoginForm next={next} />
    </AuthShell>
  )
}
