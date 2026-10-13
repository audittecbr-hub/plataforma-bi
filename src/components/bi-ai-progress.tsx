'use client'

import { Check, LoaderCircle } from 'lucide-react'
import { biProgress, type BiProgress } from '@/lib/bi-ai/progress'

export function BiAiProgress({ progress, elapsedSeconds }: { progress: BiProgress; elapsedSeconds: number }) {
  return <div className="rounded-xl border bg-surface p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-gold-text" aria-live="polite">Etapa {progress.step} de {progress.total}</p>
      <span className="text-xs tabular-nums text-faint" aria-hidden="true">{elapsedSeconds}s</span>
    </div>
    <ol className="space-y-3" aria-label="Andamento da análise">
      {([1, 2, 3] as const).map(step => <li key={step} className={`flex items-center gap-3 text-sm ${step > progress.step ? 'text-faint' : 'text-foreground'}`}>
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${step <= progress.step ? 'border-gold/40 bg-gold-wash text-gold-text' : ''}`}>
          {step < progress.step ? <Check className="size-3.5" /> : step === progress.step ? <LoaderCircle className="size-3.5 animate-spin" /> : step}
        </span>
        <span className={step === progress.step ? 'font-medium' : ''}>{biProgress(step).title}</span>
      </li>)}
    </ol>
    <p className="mt-4 border-t pt-3 text-xs leading-5 text-muted-foreground" aria-live="polite">{progress.detail}</p>
    {elapsedSeconds >= 25 && <p className="mt-2 text-xs leading-5 text-muted-foreground">A análise continua em andamento. Você pode cancelar a pergunta abaixo.</p>}
  </div>
}
