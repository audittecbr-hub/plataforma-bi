'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Maximize2, Minimize2, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Altura do chrome nativo do player "Publish to web" do Power BI/Fabric:
 * section.statusBar (24px — zoom nativo) + div.logoBar (37px — marca, navegação
 * de páginas, compartilhar, tela cheia). Medido em 1280px, em emulação mobile e
 * em iframe de 390px: é constante.
 *
 * O iframe é renderizado com esta altura extra e o container recorta o excesso,
 * removendo a barra sem tocar nas URLs cadastradas. Publish to web ignora
 * navContentPaneEnabled/filterPaneEnabled/chromeless, e a JS API do Power BI
 * exige reportEmbed + token AAD (Embedded/Premium/PPU) — daí o recorte.
 */
const NATIVE_CHROME_PX = 61

/**
 * Escala de zoom do portal. 100% é o "ajustar à tela" — o fit-to-page que o
 * próprio player aplica — e é o estado inicial (FIT_INDEX), não o piso.
 *
 * Ampliar aumenta o viewport lógico do iframe, então o Power BI refaz o fit e
 * re-renderiza o relatório maior e nítido: é o mesmo mecanismo do zoom nativo,
 * não escala de bitmap. Reduzir percorre a mesma via ao contrário — o iframe
 * encolhe, o player refaz o fit e o relatório é redesenhado menor e igualmente
 * nítido, centrado no palco com margem em volta.
 *
 * Como largura e altura escalam no mesmo fator, o aspect ratio não muda: abaixo
 * de 100% o relatório não revela conteúdo novo (a 100% ele já está inteiro na
 * tela), apenas passa a ocupar menos espaço. O piso é 60% porque abaixo disso o
 * texto do relatório deixa de ser legível.
 */
const ZOOM_STEPS = [60, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300]

/** Índice do "ajustar à tela": estado inicial e destino do botão de fit. */
const FIT_INDEX = ZOOM_STEPS.indexOf(100)

interface PowerBIEmbedProps {
  src: string
  title?: string
  height?: string
}

export function PowerBIEmbed({ src, title = "Power BI Report", height = "600px" }: PowerBIEmbedProps) {
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  // zoomIndex: valor exibido na toolbar (resposta imediata ao clique).
  // appliedIndex: valor aplicado ao iframe, com debounce, para não disparar
  // um re-fit do relatório a cada clique numa sequência rápida.
  const [zoomIndex, setZoomIndex] = useState(FIT_INDEX)
  const [appliedIndex, setAppliedIndex] = useState(FIT_INDEX)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomTargetRef = useRef(FIT_INDEX)

  const isFullscreen = isNativeFullscreen || isFallbackFullscreen
  const zoom = ZOOM_STEPS[appliedIndex] / 100

  // Track window size to determine if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    // Initial check
    checkMobile()

    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Intersection Observer for Lazy Loading the Iframe
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect() // Stop observing once it's visible
        }
      },
      { rootMargin: '200px' } // Load slightly before it comes into view
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // Calculate the final URL only when src or isMobile changes
  const finalSrc = useMemo(() => {
    let newSrc = src
    if (isMobile) {
      // Append mobile layout parameter if not present
      if (!newSrc.includes('layoutType=MobilePortrait')) {
        newSrc = `${newSrc}${newSrc.includes('?') ? '&' : '?'}layoutType=MobilePortrait`
      }
    } else {
      // Remove mobile layout parameter if present (to switch back to desktop)
      newSrc = newSrc.replace(/[?&]layoutType=MobilePortrait/g, '')
      // Clean up trailing ? or & if needed
      if (newSrc.endsWith('?')) newSrc = newSrc.slice(0, -1)
      if (newSrc.endsWith('&')) newSrc = newSrc.slice(0, -1)
    }
    return newSrc
  }, [src, isMobile])

  // Ao trocar de dashboard: volta ao skeleton e reseta o zoom
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setZoomIndex(FIT_INDEX)
    setAppliedIndex(FIT_INDEX)
    zoomTargetRef.current = FIT_INDEX
  }, [finalSrc])

  // O alvo vive num ref, não no state: cliques rápidos consecutivos precisam
  // acumular a partir do último valor pedido, e não do zoomIndex do closure,
  // que só é atualizado no re-render seguinte.
  const commitZoom = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), ZOOM_STEPS.length - 1)
    zoomTargetRef.current = clamped
    setZoomIndex(clamped)
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
    zoomTimerRef.current = setTimeout(() => setAppliedIndex(clamped), 120)
  }, [])

  const stepZoom = useCallback((delta: number) => {
    commitZoom(zoomTargetRef.current + delta)
  }, [commitZoom])

  // Ao mudar o zoom, mantém o relatório centrado na horizontal: com canvas mais
  // largo que o palco, o scroll ficaria preso na borda esquerda.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2
  }, [appliedIndex])

  useEffect(() => () => {
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
  }, [])

  // Mantém o estado em sincronia com a Fullscreen API (cobre a saída via Esc/F11)
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Fallback CSS para navegadores sem Fullscreen API em elemento (iOS Safari):
  // trava o scroll do body e permite sair com Esc. A neutralização de
  // transform/filter dos ancestrais — que conteriam o position:fixed — é feita
  // em CSS pela regra .pbi-shell-fs em globals.css.
  useEffect(() => {
    if (!isFallbackFullscreen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFallbackFullscreen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isFallbackFullscreen])

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current
    if (!el) return

    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    if (isFallbackFullscreen) {
      setIsFallbackFullscreen(false)
      return
    }
    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen()
        return
      } catch {
        // Navegador recusou — segue para o fallback em CSS
      }
    }
    setIsFallbackFullscreen(true)
  }, [isFallbackFullscreen])

  const zoomPercent = ZOOM_STEPS[zoomIndex]
  const isMinZoom = zoomIndex === 0
  const isMaxZoom = zoomIndex === ZOOM_STEPS.length - 1
  const isFitZoom = zoomIndex === FIT_INDEX

  return (
    <div
      ref={containerRef}
      className={cn(
        "pbi-shell relative flex flex-col overflow-hidden rounded-lg bg-background/50",
        isFallbackFullscreen && "pbi-shell-fs fixed inset-0 z-[60] rounded-none bg-background"
      )}
      // Em tela cheia o height precisa ser 100%: um valor fixo em style sobrepõe
      // o dimensionamento que o navegador aplica ao elemento em fullscreen.
      style={{ height: isFullscreen ? '100%' : height }}
    >
      {/* Palco: área visível do relatório. Vira rolável quando há zoom, para permitir pan. */}
      <div
        ref={stageRef}
        className={cn(
          "relative flex-1 min-h-0",
          zoom > 1 ? "pbi-stage overflow-auto" : "overflow-hidden",
          // Abaixo de 100% a camada é menor que o palco e encostaria no canto
          // superior esquerdo. A centralização vale só aqui: com zoom acima de 1
          // o palco é rolável, e centrar por flex deixaria a borda esquerda do
          // canvas inalcançável pelo scroll.
          zoom < 1 && "flex items-center justify-center"
        )}
      >
        {/* Camada de zoom: cresce com o percentual e recorta o chrome nativo do player.
            O overflow-hidden aqui é o que mantém os 61px extras fora da área rolável. */}
        <div
          className="relative overflow-hidden"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          {isVisible && (
            <iframe
              key={finalSrc} // Force re-render when URL changes to ensure onLoad fires
              title={title}
              src={finalSrc}
              onLoad={() => setLoading(false)}
              className={cn(
                "absolute inset-0 w-full border-0 transition-opacity duration-300",
                loading ? "opacity-0" : "opacity-100"
              )}
              style={{ height: `calc(100% + ${NATIVE_CHROME_PX}px)` }}
            />
          )}
        </div>

        {loading && (
          <div className="absolute inset-0 z-10 bg-card/30 backdrop-blur-[2px] p-5 flex flex-col gap-3">
            {/* Header skeleton */}
            <div className="flex items-center gap-3 mb-1">
              <div className="h-5 w-36 rounded bg-gradient-to-r from-card via-primary/15 to-card bg-[length:200%_100%] animate-shimmer" />
              <div className="h-5 w-24 rounded bg-gradient-to-r from-card via-primary/15 to-card bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: '0.2s' }} />
            </div>
            {/* Content rows */}
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-lg bg-gradient-to-r from-card via-primary/10 to-card bg-[length:200%_100%] animate-shimmer"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
            <p className="text-center text-xs text-muted-foreground/50 mt-1">Carregando relatório...</p>
          </div>
        )}
      </div>

      {/* Controles do portal — substituem a barra nativa do Power BI */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-t border-primary/20 bg-card/80 px-2 backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={() => stepZoom(-1)}
          disabled={isMinZoom}
          aria-label="Reduzir zoom"
          title="Reduzir zoom"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <span
          className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-primary"
          aria-live="polite"
        >
          {zoomPercent}%
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={() => stepZoom(1)}
          disabled={isMaxZoom}
          aria-label="Ampliar zoom"
          title="Ampliar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={() => commitZoom(FIT_INDEX)}
          disabled={isFitZoom}
          aria-label="Ajustar à página"
          title="Ajustar à página"
        >
          <Scan className="h-4 w-4" />
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-primary"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
