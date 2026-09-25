import fs from "node:fs"
import path from "node:path"
import type { Metadata, Viewport } from "next"
import { Hanken_Grotesk } from "next/font/google"

import "./globals.css"
import { Providers } from "@/components/providers"
import { Toaster } from "@/components/ui/sonner"
import { DisablePrint } from "@/components/disable-print"

/**
 * Tipografia oficial do Design System: Codec Pro, com Hanken Grotesk como
 * fallback oficial.
 *
 * A Codec Pro é comercial e o repositório é público, então os .ttf não são
 * versionados: quando os arquivos licenciados estão em public/fonts/codec-pro
 * (no deploy ou na máquina de quem desenvolve), o @font-face é declarado aqui;
 * sem eles, nada é requisitado e a pilha cai na Hanken Grotesk.
 */
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const CODEC_PRO_FACES = [
  { file: "CodecPro-Regular.ttf", weight: 400, preload: true },
  { file: "CodecPro-News.ttf", weight: 500, preload: false },
  { file: "CodecPro-Bold.ttf", weight: 700, preload: true },
  { file: "CodecPro-ExtraBold.ttf", weight: 800, preload: false },
]

const codecProFaces = CODEC_PRO_FACES.filter((face) => {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", "fonts", "codec-pro", face.file))
  } catch {
    return false
  }
})

const codecProCss = codecProFaces
  .map(
    (face) =>
      `@font-face{font-family:"Codec Pro";src:url("/fonts/codec-pro/${face.file}") format("truetype");font-weight:${face.weight};font-style:normal;font-display:swap}`
  )
  .join("")

export const metadata: Metadata = {
  title: {
    default: "Grupo Studio · Portal de Inteligência",
    template: "%s · Grupo Studio",
  },
  description:
    "Portal de inteligência do Grupo Studio — dashboards, metas e relatórios reunidos em um ambiente seguro.",
  applicationName: "Grupo Studio",
  robots: { index: false, follow: false }, // Portal interno — não indexar
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    title: "Grupo Studio · Portal de Inteligência",
    description: "Dashboards, metas e relatórios do Grupo Studio em um só lugar.",
    siteName: "Grupo Studio",
    locale: "pt_BR",
    type: "website",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1f1f" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={hanken.variable}>
      <head>
        {codecProFaces
          .filter((face) => face.preload)
          .map((face) => (
            <link
              key={face.file}
              rel="preload"
              as="font"
              type="font/ttf"
              href={`/fonts/codec-pro/${face.file}`}
              crossOrigin="anonymous"
            />
          ))}
        {codecProCss && <style dangerouslySetInnerHTML={{ __html: codecProCss }} />}
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <Toaster />
          <DisablePrint />
        </Providers>
      </body>
    </html>
  )
}
