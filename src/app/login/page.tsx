import { LoginForm } from './login-form'
import { LoginGlow } from './login-glow'

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams
  const next = searchParams.next

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1c1917] p-4 text-white relative overflow-hidden">
      <LoginGlow />
      <div className="relative z-10 animate-fade-in-up">
        <LoginForm next={next} />
      </div>
    </div>
  )
}
