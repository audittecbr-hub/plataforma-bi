import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto de um painel do admin: cabeçalho, barra de busca e linhas de tabela. */
export function AdminPanelSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-busy="true" aria-label="Carregando">
      <div className="flex items-center justify-between gap-4 px-6 pb-5 pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="border-t px-6 py-3">
        <Skeleton className="h-10 w-full max-w-sm" />
      </div>
      <div className="border-t">
        <div className="h-10 border-b bg-muted/45" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex h-16 items-center gap-6 border-b px-6 last:border-0">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
