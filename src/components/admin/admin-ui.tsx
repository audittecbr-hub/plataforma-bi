"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, LoaderCircle, Search, TriangleAlert, type LucideIcon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button, type ButtonProps } from "@/components/ui/button"
import { IconBadge } from "@/components/ui/icon-badge"
import { Input } from "@/components/ui/input"
import { Hint } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Campo de busca do admin: ícone, spinner enquanto a busca navega. */
export function SearchField({
  value,
  onChange,
  placeholder,
  pending = false,
  className,
  id,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  pending?: boolean
  className?: string
  id?: string
}) {
  return (
    <div className={cn("relative w-full sm:max-w-sm", className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9"
      />
      {pending && (
        <LoaderCircle
          aria-hidden
          className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-gold"
        />
      )}
    </div>
  )
}

/** Barra de paginação: "Página X de Y" e setas. Some quando há uma página só. */
export function PaginationBar({
  page,
  totalPages,
  onPrev,
  onNext,
  disabled = false,
  summary,
}: {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
  disabled?: boolean
  summary?: React.ReactNode
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-4 border-t px-5 py-3 md:px-6">
      <p className="text-[13px] text-muted-foreground tabular-nums">
        {summary ?? (
          <>
            Página <span className="font-semibold text-foreground">{page}</span> de{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="icon-sm" onClick={onPrev} disabled={page <= 1 || disabled} aria-label="Página anterior">
          <ChevronLeft />
        </Button>
        <Button variant="secondary" size="icon-sm" onClick={onNext} disabled={page >= totalPages || disabled} aria-label="Próxima página">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

/**
 * Botão só-ícone com dica. Encaminha ref e props para funcionar como gatilho
 * de Dialog/AlertDialog (`asChild`).
 */
export const IconAction = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children"> & { label: string; icon: LucideIcon; tone?: "default" | "danger" | "success" }
>(({ label, icon: Icon, tone = "default", className, ...props }, ref) => (
  <Hint label={label}>
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      className={cn(
        tone === "danger" && "hover:bg-danger/10 hover:text-danger",
        tone === "success" && "hover:bg-success/10 hover:text-success",
        className
      )}
      {...props}
    >
      <Icon />
    </Button>
  </Hint>
))
IconAction.displayName = "IconAction"

/**
 * Confirmação destrutiva padrão do admin. `onConfirm` pode ser assíncrono: o
 * botão mostra o andamento e o diálogo só fecha quando a ação termina.
 */
export function DestructiveConfirm({
  trigger,
  title,
  description,
  confirmLabel = "Excluir",
  onConfirm,
}: {
  trigger: React.ReactElement
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel?: string
  onConfirm: () => Promise<boolean | void> | boolean | void
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const result = await onConfirm()
      if (result !== false) setOpen(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader className="gap-4">
          <IconBadge icon={TriangleAlert} tone="danger" />
          <div className="space-y-1.5">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive hover:brightness-95"
          >
            {pending && <LoaderCircle className="animate-spin" />}
            {pending ? "Excluindo…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Seção de formulário dentro de diálogos: título em sobrelinha + conteúdo. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn("grid min-w-0 gap-4 border-t pt-5 first:border-t-0 first:pt-0", className)}>
      <legend className="sr-only">{title}</legend>
      <div className="space-y-1">
        <p aria-hidden className="eyebrow text-[10.5px] text-gold-text">
          {title}
        </p>
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </fieldset>
  )
}

/** Opção marcável em grade (permissões, visibilidade, destinatários). */
export function CheckOption({
  children,
  htmlFor,
  className,
}: {
  children: React.ReactNode
  htmlFor?: string
  className?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-[4px] border bg-surface px-3 py-2.5 text-[13px] font-medium text-foreground",
        "transition-colors duration-200 hover:border-foreground/30",
        "has-[input:checked]:border-primary has-[input:checked]:bg-gold-wash",
        className
      )}
    >
      {children}
    </label>
  )
}
