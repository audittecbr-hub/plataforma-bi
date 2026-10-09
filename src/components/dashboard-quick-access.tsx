'use client'

import { useId, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, ChartColumnBig, Clock3, Compass, MapPinned, Search, Star, Target, Users, Wallet } from 'lucide-react'
import { DashboardFavoriteButton } from '@/components/dashboard-favorite-button'
import { useDashboardNavigation } from '@/components/dashboard-navigation-provider'
import { useDashboardShortcuts } from '@/components/dashboard-shortcuts-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { GROUP_META } from '@/lib/department-meta'
import type { DashboardSelection } from '@/lib/dashboard-navigation'
import { dashboardShortcutEntries, shortcutLocation, starterShortcuts } from '@/lib/dashboard-shortcuts'
import { cn } from '@/lib/utils'

const CARD_LIMIT = 6

function reportPath(selection: DashboardSelection) {
  return `${selection.area.label}${selection.section.id !== 'Visão geral' ? ` · ${selection.section.label}` : ''}`
}

const COVER_ICONS = { goals: Target, finance: Wallet, regions: MapPinned, people: Users }

function coverKind(reportName: string) {
  const name = reportName.toLocaleLowerCase('pt-BR')
  if (/meta/.test(name)) return 'goals'
  if (/despesa|financeir|comission|dre|fundo|receber/.test(name)) return 'finance'
  if (/regional|regionais|distribuição/.test(name)) return 'regions'
  if (/unidade|cliente|líder/.test(name)) return 'people'
  return 'area'
}

function ShortcutCard({ selection, openedAt }: { selection: DashboardSelection; openedAt?: number }) {
  const { hrefFor, selectDashboard } = useDashboardNavigation()
  const { area, section, dashboard } = selection
  const kind = coverKind(dashboard.name)
  const CoverIcon = kind === 'area' ? GROUP_META[area.id]?.icon ?? ChartColumnBig : COVER_ICONS[kind]
  const onOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    selectDashboard(area.id, section.id, dashboard.id)
  }

  return (
    <article className="relative flex min-w-0 flex-col">
      <Link
        href={hrefFor(area.id, section.id, dashboard.id)} prefetch={false}
        aria-label={`Abrir ${dashboard.name}`} onClick={onOpen}
        className="group/card flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs outline-none transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div aria-hidden className="relative flex h-28 items-end overflow-hidden border-b bg-background p-4">
          <span className="absolute left-0 top-0 h-full w-[3px] bg-gold/50 transition-colors group-hover/card:bg-gold" />
          <span className="absolute left-4 top-4 eyebrow text-[10px] tracking-[0.12em] text-muted-foreground">{GROUP_META[area.id]?.label ?? area.label}</span>
          <span className="grid size-12 place-items-center rounded-xl border border-primary/15 bg-gold-wash text-gold-text"><CoverIcon className="size-7" /></span>
          <CoverIcon className="absolute -bottom-5 right-5 size-28 text-primary/[0.08]" strokeWidth={1} />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="break-words pr-1 text-[17px] font-bold leading-snug text-foreground transition-colors group-hover/card:text-gold-text">{dashboard.name}</h3>
          <p className="break-words text-sm leading-relaxed text-muted-foreground">{reportPath(selection)}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[13px]">
            {openedAt ? <span className="text-muted-foreground">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(openedAt))}</span> : <span className="font-semibold text-gold-text">Abrir relatório</span>}
            <ArrowRight aria-hidden className="ml-auto size-4 text-gold-text transition-transform group-hover/card:translate-x-0.5 motion-reduce:transition-none" />
          </div>
        </div>
      </Link>
      <DashboardFavoriteButton location={shortcutLocation(selection)} name={dashboard.name} className="absolute right-3 top-3 z-10 border bg-card shadow-xs hover:border-primary/40" />
    </article>
  )
}

function FavoritesPickerList() {
  const { catalog } = useDashboardNavigation()
  const { favorites, isFavorite } = useDashboardShortcuts()
  const [query, setQuery] = useState('')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const entries = useMemo(() => dashboardShortcutEntries(catalog), [catalog])
  const results = useMemo(() => {
    const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean)
    return entries.filter((entry) => {
      if (onlyFavorites && !isFavorite(entry.dashboard.id)) return false
      const text = normalize(`${entry.dashboard.name} ${reportPath(entry)} ${entry.dashboard.department} ${(entry.dashboard.allowed_departments ?? []).join(' ')}`)
      return words.every((word) => text.includes(word))
    })
  }, [entries, query, onlyFavorites, isFavorite])

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-3 rounded-[4px] border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/30">
        <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <input autoFocus aria-label="Buscar relatórios para favoritar" placeholder="Buscar por nome ou área…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm">
        <p role="status" className="text-muted-foreground">{favorites.length} {favorites.length === 1 ? 'favorito salvo' : 'favoritos salvos'}</p>
        <button type="button" onClick={() => setOnlyFavorites((current) => !current)} aria-pressed={onlyFavorites} className={cn('flex min-h-10 items-center gap-2 rounded-[4px] px-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring', onlyFavorites ? 'bg-gold-wash text-gold-text' : 'text-muted-foreground hover:bg-accent')}><Star aria-hidden className="size-4" />Só favoritos</button>
      </div>
      <ul aria-label="Relatórios para favoritar" className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain pr-1">
        {results.map((selection) => {
          const Icon = GROUP_META[selection.area.id]?.icon ?? ChartColumnBig
          return (
            <li key={selection.dashboard.id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[4px] bg-gold-wash text-gold-text"><Icon aria-hidden className="size-5" /></span>
              <div className="min-w-0 flex-1 space-y-1"><p className="break-words text-base font-semibold text-foreground">{selection.dashboard.name}</p><p className="break-words text-sm text-muted-foreground">{reportPath(selection)}</p></div>
              <DashboardFavoriteButton location={shortcutLocation(selection)} name={selection.dashboard.name} />
            </li>
          )
        })}
        {results.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">{onlyFavorites ? 'Nenhum favorito encontrado. Desative o filtro para escolher projetos.' : 'Nenhum relatório encontrado. Tente outro nome ou área.'}</li>}
      </ul>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-[13px] text-muted-foreground">Salvos para sua conta neste navegador.</p>
        <DialogClose asChild><Button>Concluir</Button></DialogClose>
      </div>
    </>
  )
}

export function DashboardQuickAccess() {
  const { catalog } = useDashboardNavigation()
  const { ready, favorites, recents, storageUnavailable } = useDashboardShortcuts()
  const [pickerOpen, setPickerOpen] = useState(false)
  const id = useId()
  const suggestions = useMemo(() => starterShortcuts(catalog, CARD_LIMIT), [catalog])

  return (
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
    <div className="flex flex-col gap-7">
      {ready && favorites.length > 0 && (
      <section aria-labelledby={`${id}-favorites`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Star aria-hidden className="size-5 text-gold-text" /><div><h2 id={`${id}-favorites`} className="text-lg font-bold">Favoritos</h2><p className="mt-0.5 text-sm text-muted-foreground">Os projetos que você quer sempre por perto.</p></div></div>
          <DialogTrigger asChild><Button variant="ghost" className="h-11 text-gold-text">{favorites.length > CARD_LIMIT ? `Ver todos (${favorites.length})` : 'Gerenciar favoritos'}<ArrowRight aria-hidden className="size-4" /></Button></DialogTrigger>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{favorites.slice(0, CARD_LIMIT).map((selection) => <ShortcutCard key={selection.dashboard.id} selection={selection} />)}</div>
      </section>
      )}

      <section aria-labelledby={`${id}-recent`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">{recents.length ? <Clock3 aria-hidden className="size-5 text-gold-text" /> : <Compass aria-hidden className="size-5 text-gold-text" />}<div><h2 id={`${id}-recent`} className="text-lg font-bold">{recents.length ? 'Acessados recentemente' : 'Explore seus relatórios'}</h2><p className="mt-0.5 text-sm text-muted-foreground">{recents.length ? 'Continue de onde parou.' : 'Algumas opções para começar. Seus próximos acessos aparecerão aqui.'}</p></div></div>
          {favorites.length === 0 && <DialogTrigger asChild><Button variant="ghost" className="h-11 text-gold-text" disabled={!ready || catalog.totalReports === 0}>Escolher favoritos<ArrowRight aria-hidden className="size-4" /></Button></DialogTrigger>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {recents.length ? recents.slice(0, CARD_LIMIT).map((selection) => <ShortcutCard key={selection.dashboard.id} selection={selection} openedAt={selection.openedAt} />) : suggestions.map((selection) => <ShortcutCard key={selection.dashboard.id} selection={selection} />)}
        </div>
        {catalog.totalReports === 0 && <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Os relatórios liberados para seu perfil aparecerão aqui assim que estiverem disponíveis.</div>}
      </section>
      <p className="text-[13px] text-muted-foreground">{storageUnavailable ? 'Não foi possível salvar neste navegador. Seus atalhos continuam disponíveis durante esta visita.' : 'Favoritos e recentes são pessoais e ficam salvos neste navegador.'}</p>

        <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-[640px]">
          <DialogHeader><DialogTitle>Escolha seus favoritos</DialogTitle><DialogDescription>Marque a estrela dos projetos que você usa mais. Eles aparecerão na sua página inicial.</DialogDescription></DialogHeader>
          <FavoritesPickerList />
        </DialogContent>
    </div>
    </Dialog>
  )
}
