"use client"

import { useTheme } from "next-themes"
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

export function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "light"}
      position="bottom-right"
      gap={10}
      offset={20}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-[18px] text-success" />,
        error: <CircleAlert className="size-[18px] text-danger" />,
        warning: <TriangleAlert className="size-[18px] text-warning" />,
        info: <Info className="size-[18px] text-info" />,
        loading: <LoaderCircle className="size-[18px] animate-spin text-gold" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "font-sans! gap-3! px-4! py-3.5! shadow-lg!",
          title: "text-[13px]! font-semibold!",
          description: "text-xs! text-muted-foreground!",
          actionButton: "bg-primary! text-primary-foreground! rounded-[4px]! font-semibold!",
          cancelButton: "bg-muted! text-muted-foreground! rounded-[4px]!",
          closeButton: "bg-popover! border-border! text-muted-foreground!",
        },
      }}
      {...props}
    />
  )
}
