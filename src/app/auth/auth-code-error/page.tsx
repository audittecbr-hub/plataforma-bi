import Link from 'next/link'
import { ArrowLeft, Link2Off } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'

export const metadata = { title: 'Link inválido' }

/**
 * Destino do /auth/callback quando a troca do código falha (link expirado ou
 * já usado). Antes esta rota não existia e o usuário caía num 404.
 */
export default function AuthCodeErrorPage() {
  return (
    <AuthShell>
      <div className="space-y-8">
        <IconBadge icon={Link2Off} tone="gold" size="lg" />
        <div className="space-y-3">
          <p className="eyebrow flex items-center gap-3 text-gold-text">
            <span aria-hidden className="h-[3px] w-8 bg-gold" />
            Link de acesso
          </p>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
            Este link não é mais válido
          </h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Links de acesso e de redefinição de senha são de uso único e expiram depois de um tempo. Entre novamente ou peça um novo link ao administrador do portal.
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">
            <ArrowLeft /> Voltar para o login
          </Link>
        </Button>
      </div>
    </AuthShell>
  )
}
