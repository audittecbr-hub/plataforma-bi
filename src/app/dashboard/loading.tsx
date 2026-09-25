import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8" aria-busy="true" aria-label="Carregando">
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-11 w-80 max-w-[70vw] rounded-xl" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="hidden h-16 w-52 rounded-2xl md:block" />
      </div>

      <Skeleton className="h-12 w-full max-w-3xl rounded-2xl" />

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-md">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3">
          <div className="flex gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-11 w-72 rounded-xl" />
        </div>
        <div className="space-y-3 p-5" style={{ minHeight: "max(540px, calc(100dvh - 16rem))" }}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Skeleton className="h-72 rounded-xl md:col-span-2" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
        <div className="flex h-12 items-center justify-between border-t border-border/70 px-4">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
