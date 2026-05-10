import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
    return (
        <div className="flex flex-col gap-6 h-full animate-pulse">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48 bg-[#D5AE77]/10" />
            </div>

            {/* Simulação do AdminTabsNav */}
            <div className="w-full flex gap-1 p-1 bg-card border border-[#D5AE77]/20 rounded-md">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 flex-1 bg-[#D5AE77]/5" />
                ))}
            </div>

            {/* Simulação da Tabela */}
            <div className="flex flex-col gap-4 mt-4">
                <div className="flex items-center justify-between mb-2">
                    <Skeleton className="h-9 w-48 bg-[#D5AE77]/10" />
                    <Skeleton className="h-9 w-32 bg-[#D5AE77]/10" />
                </div>
                
                <div className="rounded-md border border-[#D5AE77]/10 overflow-hidden">
                    <div className="h-10 bg-[#D5AE77]/5 w-full border-b border-[#D5AE77]/10" />
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 w-full border-b border-[#D5AE77]/10 flex items-center px-4 gap-4">
                            <Skeleton className="h-4 w-1/4 bg-[#D5AE77]/5" />
                            <Skeleton className="h-4 w-1/4 bg-[#D5AE77]/5" />
                            <Skeleton className="h-4 w-1/4 bg-[#D5AE77]/5" />
                            <Skeleton className="h-4 w-1/6 bg-[#D5AE77]/5 ml-auto" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
