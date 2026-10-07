'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Inbox, Link2Off } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { PowerBIEmbed } from '@/components/powerbi-embed'
import { useDashboardNavigation } from '@/components/dashboard-navigation-provider'

const REPORT_HEIGHT = 'max(540px, calc(100dvh - 16rem))'

/** O visualizador acompanha a seleção feita no menu lateral e no histórico. */
export function DashboardSelector() {
  const { selection } = useDashboardNavigation()
  const prefersReducedMotion = useReducedMotion()
  const dashboard = selection?.dashboard
  const showEmbed = !!dashboard?.url && !dashboard.url.includes('mock')
  const sectionLabel = selection?.section.label !== 'Visão geral' ? selection?.section.label : null

  return (
    <section aria-label="Relatório selecionado" className="relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <span aria-hidden className="pointer-events-none absolute left-5 top-0 z-10 h-[3px] w-10 bg-gold" />
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={dashboard?.id ?? 'empty'}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
          >
            {showEmbed && dashboard ? (
              <PowerBIEmbed
                key={dashboard.id} src={dashboard.url} title={dashboard.name}
                caption={`${selection?.area.label}${sectionLabel ? ` · ${sectionLabel}` : ''} · ${dashboard.name}`}
                height={REPORT_HEIGHT}
              />
            ) : (
              <div className="grid place-items-center bg-grid" style={{ minHeight: REPORT_HEIGHT }}>
                {!dashboard ? (
                  <EmptyState icon={Inbox} title="Nenhum relatório por aqui" description="Os relatórios liberados para você aparecerão no menu lateral assim que forem cadastrados." />
                ) : (
                  <EmptyState icon={Link2Off} title="Relatório aguardando publicação" description={<><span className="font-medium text-foreground">{dashboard.name}</span> ainda não tem um link do Power BI configurado. Fale com o administrador do portal.</>} />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
