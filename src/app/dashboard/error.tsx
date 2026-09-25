'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'

/** Falha ao renderizar uma página do portal: explica e oferece tentar de novo. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="relative w-full max-w-lg animate-rise rounded-xl border bg-card p-8 text-center shadow-sm">
        <span aria-hidden className="absolute left-1/2 top-0 h-[3px] w-10 -translate-x-1/2 bg-gold" />
        <div className="flex flex-col items-center gap-5">
          <IconBadge icon={TriangleAlert} tone="danger" size="lg" />
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground">Algo não saiu como esperado</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Não foi possível carregar esta página agora. Tente novamente; se o problema continuar, avise o administrador do portal.
            </p>
            {error.digest && (
              <p className="pt-1 font-mono text-[11px] text-faint">Código do erro: {error.digest}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={reset}>
              <RotateCcw /> Tentar novamente
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Ir para os dashboards</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
