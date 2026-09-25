"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoaderCircle } from 'lucide-react'
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState, useTransition } from "react"
import { useIsClient } from "@/hooks/use-is-client"
import { ADMIN_SECTIONS } from "@/lib/navigation"
import { cn } from "@/lib/utils"

export function AdminTabsNav() {
    // Os ids do Radix diferem entre servidor e cliente nesta árvore; renderizar
    // só após a hidratação evita o aviso de mismatch.
    const isClient = useIsClient()

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

    if (!isClient) {
        return <div className="h-11 w-full border-b" aria-hidden />
    }

    return (
        <div className="w-full">
            {/* Mobile: seletor */}
            <div className="w-full md:hidden">
                <Select value={activeTab} onValueChange={handleTabChange} disabled={isPending}>
                    <SelectTrigger className="h-11 w-full" aria-label="Seção do painel">
                        <div className="flex items-center gap-2">
                             {isPending && <LoaderCircle className="size-3.5 animate-spin text-gold"/>}
                             <SelectValue placeholder="Selecione uma seção" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        {ADMIN_SECTIONS.map((item) => (
                            <SelectItem key={item.tab} value={item.tab}>
                                <div className="flex items-center gap-2">
                                    <item.icon className="size-4" />
                                    {item.label}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Desktop: abas editoriais, controladas pela URL */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="hidden w-full md:flex">
                <TabsList className={cn("w-full justify-start", isPending && "pointer-events-none")}>
                    {ADMIN_SECTIONS.map((item) => (
                        <TabsTrigger key={item.tab} value={item.tab} className="gap-2">
                            <item.icon className="size-4" />
                            {item.label}
                            {isPending && pendingTab === item.tab && <LoaderCircle className="size-3.5 animate-spin text-gold" />}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    )
}
