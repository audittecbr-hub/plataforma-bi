"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Menu, LayoutDashboard, Settings, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

import { useState, useEffect } from "react"

interface MobileNavProps {
  isAdmin: boolean
}

export function MobileNav({ isAdmin }: MobileNavProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-10 h-10" />

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden text-foreground">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px] bg-card/90 backdrop-blur-md text-foreground border-primary/20 rounded-xl mt-2">
        <DropdownMenuLabel className="text-primary">Menu</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-primary/20" />
        
        <DropdownMenuItem asChild>
          <Link 
            href="/dashboard"
            prefetch={true}
            className={cn(
                "w-full cursor-pointer flex items-center gap-2", 
                pathname === "/dashboard" ? "text-primary" : "text-foreground"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>
        </DropdownMenuItem>



        <DropdownMenuItem asChild>
          <Link 
            href="/dashboard/settings"
            prefetch={true}
            className={cn(
                "w-full cursor-pointer flex items-center gap-2", 
                pathname === "/dashboard/settings" ? "text-primary" : "text-foreground"
            )}
          >
            <Settings className="h-4 w-4" />
            <span>Configurações</span>
          </Link>
        </DropdownMenuItem>

        {isAdmin && (
            <DropdownMenuItem asChild>
            <Link 
                href="/dashboard/admin"
                prefetch={true}
                className={cn(
                    "w-full cursor-pointer flex items-center gap-2", 
                    pathname === "/dashboard/admin" ? "text-primary" : "text-foreground"
                )}
            >
                <ShieldCheck className="h-4 w-4" />
                <span>Admin</span>
            </Link>
            </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
