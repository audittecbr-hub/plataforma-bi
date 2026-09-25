"use client"

import * as React from "react"
import { Eye, EyeOff, LockKeyhole } from "lucide-react"
import { Input, type InputProps } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Campo de senha com ícone, botão de mostrar/ocultar e aviso de Caps Lock.
 * Continua sendo um `<input>` comum: `name`, `required` e `minLength` seguem
 * valendo para o formulário.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>(
  ({ className, onKeyUp, onKeyDown, onBlur, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)
    const [capsLock, setCapsLock] = React.useState(false)

    const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
      setCapsLock(e.getModifierState?.("CapsLock") ?? false)
    }

    return (
      <div className="space-y-1.5">
        <div className="relative">
          <LockKeyhole aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            ref={ref}
            type={visible ? "text" : "password"}
            className={cn("pl-10 pr-11", className)}
            onKeyUp={(e) => {
              checkCaps(e)
              onKeyUp?.(e)
            }}
            onKeyDown={(e) => {
              checkCaps(e)
              onKeyDown?.(e)
            }}
            onBlur={(e) => {
              setCapsLock(false)
              onBlur?.(e)
            }}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[4px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {capsLock && (
          <p role="status" className="text-xs font-medium text-warning">
            Caps Lock está ativado.
          </p>
        )}
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

/** Força da senha em 0–4, para o medidor visual (o servidor segue exigindo 6+). */
export function passwordStrength(value: string) {
  let score = 0
  if (value.length >= 8) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score++
  return value.length === 0 ? 0 : Math.max(1, score)
}

const STRENGTH_LABELS = ["", "Fraca", "Razoável", "Boa", "Forte"]

export function PasswordStrengthMeter({ value }: { value: string }) {
  const score = passwordStrength(value)
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1 rounded-full transition-colors duration-300",
              score >= step ? (score <= 1 ? "bg-danger" : score === 2 ? "bg-warning" : "bg-primary") : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value ? (
          <>
            Força da senha: <span className="font-semibold text-foreground">{STRENGTH_LABELS[score]}</span>
          </>
        ) : (
          "Use 8 ou mais caracteres, com letras maiúsculas, minúsculas e números."
        )}
      </p>
    </div>
  )
}
