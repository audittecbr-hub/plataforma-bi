"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, LayoutDashboard, CalendarClock, Activity, MessageSquareText, Loader2 } from 'lucide-react'
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState, useTransition, useEffect } from "react"
import { cn } from "@/lib/utils"


export function AdminTabsNav() {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [pendingTab, setPendingTab] = useState<string | null>(null)
    
    // Default to 'users' if no tab param
    const activeTab = searchParams.get('tab') || 'users'

    const createQueryString = useCallback(
        (name: string, value: string) => {
          const params = new URLSearchParams(searchParams.toString())
          params.set(name, value)
          return params.toString()
        },
        [searchParams]
    )

    const handleTabChange = (value: string) => {
        if (value === activeTab) return
        
        setPendingTab(value)
        startTransition(() => {
            router.push(`?${createQueryString('tab', value)}`)
        })
    }

    const menuItems = [
        { value: "users", label: "Usuários", icon: Users },
        { value: "dashboards", label: "Dashboards", icon: LayoutDashboard },
        { value: "automation", label: "Automação", icon: CalendarClock },
        { value: "templates", label: "Templates", icon: MessageSquareText },
        { value: "accessLogs", label: "Acessos", icon: Activity },
    ]

    if (!mounted) {
        return (
            <div className="w-full h-10 bg-card/20 animate-pulse rounded-md" />
        )
    }

    return (
        <div className="w-full">
            {/* Mobile View: Select Dropdown */}
            <div className="md:hidden w-full mb-4">
                <Select value={activeTab} onValueChange={handleTabChange} disabled={isPending}>
                    <SelectTrigger className="w-full bg-card/50 border-[#D5AE77]/20">
                        <div className="flex items-center gap-2">
                             {isPending && <Loader2 className="h-3 w-3 animate-spin"/>}
                             <SelectValue placeholder="Selecione uma opção" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        {menuItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                                <div className="flex items-center gap-2">
                                    <item.icon className="h-4 w-4" />
                                    {item.label}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Desktop View: Tabs List */}
            {/* We use Radix UI Tabs for styling but control it manually via URL */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className={cn(
                    "hidden md:flex w-full justify-start h-auto bg-card border border-[#D5AE77]/20 p-1 gap-1 transition-opacity",
                    isPending ? "opacity-70 pointer-events-none" : ""
                )}>
                    {menuItems.map((item) => (
                        <TabsTrigger key={item.value} value={item.value} className="gap-2">
                            <item.icon className="h-4 w-4" /> 
                            {item.label}
                            {isPending && pendingTab === item.value && <Loader2 className="h-3 w-3 animate-spin ml-1"/>}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    )
}
