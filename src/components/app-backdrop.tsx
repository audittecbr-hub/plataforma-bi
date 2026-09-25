import { cn } from "@/lib/utils"

/**
 * Fundo do portal: sólido, como pede o DS, com um grid hairline que se dissolve
 * abaixo do cabeçalho — a única textura permitida. Fica atrás de tudo (-z-10),
 * nunca por cima do relatório do Power BI.
 */
export function AppBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-grid [mask-image:linear-gradient(to_bottom,#000,transparent_42%)]" />
    </div>
  )
}
