import { BrandLogo } from "@/components/brand/logo"

/** Provas reais da marca, como o Design System orienta usar. */
const PROOF = [
  { value: "+30", label: "anos de mercado" },
  { value: "+35 mil", label: "clientes atendidos" },
  { value: "+40", label: "soluções integradas" },
]

/**
 * Moldura das telas de autenticação: painel da marca em preto premium e o
 * formulário numa ilha clara — as duas famílias de fundo do DS, lado a lado,
 * independentes do tema escolhido no portal.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-auth-shell className="grid min-h-dvh lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <aside className="dark relative isolate flex flex-col overflow-hidden bg-background px-6 pb-8 pt-8 text-foreground sm:px-10 lg:px-14 lg:py-12 xl:px-20">
        {/* Grid hairline — a única textura permitida pelo DS */}
        <div
          aria-hidden
          className="bg-grid absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,transparent,#000_30%,#000_70%,transparent)]"
        />

        <BrandLogo tone="white" height={44} priority className="animate-fade" />

        <div className="mt-10 max-w-xl animate-rise space-y-5 lg:my-auto lg:space-y-7 [animation-delay:80ms]">
          <p className="eyebrow flex items-center gap-3 text-primary">
            <span aria-hidden className="h-[3px] w-8 bg-primary" />
            Portal de inteligência
          </p>
          <h1 className="text-[2.1rem] font-extrabold leading-[1.04] tracking-[-0.02em] sm:text-[2.75rem] xl:text-[3.4rem]">
            Os indicadores do Grupo Studio, <span className="text-primary">em um só lugar.</span>
          </h1>
          <p className="hidden max-w-md text-[1.05rem] leading-relaxed text-muted-foreground sm:block">
            Dashboards, metas e relatórios de todas as áreas, com acesso seguro e por perfil.
          </p>
        </div>

        <div className="mt-12 hidden animate-rise space-y-8 lg:block [animation-delay:160ms]">
          <dl className="grid max-w-xl grid-cols-3 gap-6 border-t pt-8">
            {PROOF.map((item) => (
              <div key={item.label} className="space-y-1">
                <dt className="sr-only">{item.label}</dt>
                <dd className="text-[1.9rem] font-extrabold leading-none tracking-[-0.02em] text-foreground">{item.value}</dd>
                <dd className="text-[13px] text-muted-foreground">{item.label}</dd>
              </div>
            ))}
          </dl>
          <p className="eyebrow text-[10px] text-faint">
            © {new Date().getFullYear()} Grupo Studio · Área restrita
          </p>
        </div>
      </aside>

      <main className="light flex items-center justify-center bg-card px-6 py-12 text-foreground sm:px-10">
        <div className="w-full max-w-[400px] animate-rise [animation-delay:120ms]">{children}</div>
      </main>
    </div>
  )
}
