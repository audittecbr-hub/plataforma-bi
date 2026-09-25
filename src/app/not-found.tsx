import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BrandLogo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Página não encontrada' }

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col px-6 py-8 sm:px-10">
      <div
        aria-hidden
        className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,#000,transparent)]"
      />
      <BrandLogo height={36} />

      <main className="mx-auto flex w-full max-w-xl flex-1 animate-rise flex-col items-start justify-center gap-6 py-16">
        <p className="eyebrow flex items-center gap-3 text-gold-text">
          <span aria-hidden className="h-[3px] w-8 bg-gold" />
          Erro 404
        </p>
        <h1 className="text-[2.6rem] font-extrabold leading-[1.04] tracking-[-0.02em] text-foreground sm:text-[3.4rem]">
          Esta página não existe.
        </h1>
        <p className="max-w-md text-[1.05rem] leading-relaxed text-muted-foreground">
          O endereço pode ter mudado ou o link está incompleto. Volte ao portal para continuar de onde parou.
        </p>
        <Button asChild size="lg">
          <Link href="/">
            <ArrowLeft /> Voltar ao portal
          </Link>
        </Button>
      </main>
    </div>
  )
}
