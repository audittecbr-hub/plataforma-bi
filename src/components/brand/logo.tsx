import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Marca oficial do Grupo Studio, sempre a partir dos arquivos do Design System
 * (public/brand). O DS proíbe recompor o logo em texto, distorcer, recolorir
 * fora das versões aprovadas e aplicar efeitos — por isso aqui só há imagens.
 *
 * Versões:
 *  · V1 horizontal — selo + filete + "GRUPO / STUDIO" (grafite ou branco)
 *  · V2 vertical   — selo, "GRUPO STUDIO" e o tagline (branco)
 *  · Selo "GS"     — recorte exato do selo da V1, para espaços compactos
 *
 * `tone="auto"` mostra a versão grafite no tema claro e a branca no escuro.
 */

type Tone = "dark" | "white" | "auto"

const V1 = { width: 1253, height: 381, dark: "/brand/grupo-studio-horizontal-grafite.png", white: "/brand/grupo-studio-horizontal-branco.png" }
const V2 = { width: 1420, height: 472, white: "/brand/grupo-studio-vertical-branco.png" }
const SEAL = { size: 286, dark: "/brand/gs-selo-grafite.png", white: "/brand/gs-selo-branco.png" }

function Themed({
  dark,
  white,
  tone,
  alt,
  width,
  height,
  priority,
}: {
  dark: string
  white: string
  tone: Tone
  alt: string
  width: number
  height: number
  priority?: boolean
}) {
  const common = {
    width,
    height,
    unoptimized: true,
    priority,
    draggable: false,
    style: { width, height },
  } as const

  if (tone === "dark") return <Image src={dark} alt={alt} {...common} className="select-none" />
  if (tone === "white") return <Image src={white} alt={alt} {...common} className="select-none" />
  return (
    <>
      <Image src={dark} alt={alt} {...common} className="select-none dark:hidden" />
      <Image src={white} alt={alt} {...common} className="hidden select-none dark:block" />
    </>
  )
}

/** V1 horizontal. `height` define o tamanho; a largura segue a proporção oficial. */
export function BrandLogo({
  tone = "auto",
  height = 34,
  priority,
  className,
}: {
  tone?: Tone
  height?: number
  priority?: boolean
  className?: string
}) {
  const width = Math.round((height * V1.width) / V1.height)
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <Themed dark={V1.dark} white={V1.white} tone={tone} alt="Grupo Studio" width={width} height={height} priority={priority} />
    </span>
  )
}

/** Selo "GS" isolado. Decorativo por padrão (quando há texto da marca ao lado). */
export function BrandSeal({
  tone = "auto",
  size = 32,
  alt = "",
  className,
}: {
  tone?: Tone
  size?: number
  alt?: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex shrink-0", className)} aria-hidden={alt ? undefined : true}>
      <Themed dark={SEAL.dark} white={SEAL.white} tone={tone} alt={alt} width={size} height={size} />
    </span>
  )
}

/** V2 vertical com tagline — versão branca, para fundos em preto premium. */
export function BrandLockupVertical({ width = 300, className }: { width?: number; className?: string }) {
  const height = Math.round((width * V2.height) / V2.width)
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <Image
        src={V2.white}
        alt="Grupo Studio — soluções corporativas inteligentes"
        width={width}
        height={height}
        unoptimized
        priority
        draggable={false}
        className="select-none"
        style={{ width, height }}
      />
    </span>
  )
}
