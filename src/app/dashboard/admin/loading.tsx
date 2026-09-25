import { Skeleton } from '@/components/ui/skeleton'
import { AdminPanelSkeleton } from '@/components/admin/admin-skeleton'

export default function AdminLoading() {
    return (
        <div className="flex flex-col gap-6 lg:gap-8">
            <div className="space-y-3">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-11 w-96 max-w-[70vw]" />
                <Skeleton className="h-4 w-80 max-w-[60vw]" />
            </div>

            <div className="flex gap-7 border-b pb-3">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-5 w-24" />
                ))}
            </div>

            <AdminPanelSkeleton />
        </div>
    )
}
