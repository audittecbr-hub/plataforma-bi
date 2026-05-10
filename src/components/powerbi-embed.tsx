'use client'

import { useState, useEffect, useMemo, useRef } from 'react'

interface PowerBIEmbedProps {
  src: string
  title?: string
  height?: string
}

export function PowerBIEmbed({ src, title = "Power BI Report", height = "600px" }: PowerBIEmbedProps) {
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  // Trigger loading only when the URL actually changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
  }, [finalSrc])

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg bg-background/50" style={{ height }}>
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
      {isVisible && (
        <iframe
          key={finalSrc} // Force re-render when URL changes to ensure onLoad fires
          title={title}
          width="100%"
          height="100%"
          src={finalSrc}
          frameBorder="0"
          allowFullScreen={true}
          onLoad={() => setLoading(false)}
          className={`w-full h-full transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
        />
      )}
    </div>
  )
}
