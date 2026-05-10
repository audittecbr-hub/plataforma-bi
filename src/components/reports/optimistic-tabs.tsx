"use client"

import { useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

interface OptimisticTabsProps {
  tabs: { value: string; label: string }[]
  activeTab: string
}

export function OptimisticTabs({ tabs, activeTab }: OptimisticTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const handleTabChange = (value: string) => {
    if (value === activeTab) return

    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    params.set("page", "1") // Reset page on tab change

    startTransition(() => {
      // Optimistic update happens immediately in UI due to pending state handling if needed,
      // but here we just trigger the navigation.
      // Ideally, the parent or a layout would show a loading indicator, 
      // but strictly "optimistic" usually implies local state update.
      // Since the content depends on server data, we can't show data instantly,
      // BUT we can show the TAB as active instantly.
      
      // However, since we are doing a server navigation, we can't "force" the tab state 
      // unless we wrap the whole page content or use a local state that syncs.
      // For now, let's use router.replace/push wrapped in transition to allow
      // the UI to remain responsive. The user will see the tab click "register" immediately
      // if we add a loading effect on the tabs themselves.
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  // We can track the "optimistic" active tab via local state if we want instant switch visual,
  // but simpler is to just rely on isPending to show a "loading" state on the content.
  // Actually, to make it feel instant, we should visually switch the tab immediately.
  
  // Let's rely on standard navigation but with transition for now.
  // The delay involves the Fetch.
  
  return (
    <div className={cn(
      "flex items-center justify-center w-fit bg-[#1F1F1F]/50 border border-[#FDFDFD]/10 p-1 h-auto rounded-xl gap-1",
      // Removed grid logic to prevent layout + width issues (especially with w-fit + fr units)
      // Flexbox naturally handles content width better for this "pill" toggle pattern.
    )}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.value
        // If we are pending a transition to this tab, we could show a spinner or opacity.
        
        return (
            <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                disabled={isPending}
                className={cn(
                    "flex items-center justify-center text-xs px-4 py-2 h-8 rounded-lg transition-all font-medium whitespace-nowrap min-w-[80px]",
                    isActive 
                        ? "bg-[#D5AE77] text-[#322E2B] font-bold shadow-sm" 
                        : "text-[#FDFDFD]/70 hover:bg-[#FDFDFD]/5",
                    isPending && "opacity-50 cursor-wait"
                )}
            >
                {tab.label}
            </button>
        )
      })}
    </div>
  )
}
