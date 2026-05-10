import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import type { Metadata } from "next";
import { Cinzel, Montserrat } from "next/font/google";

import "./globals.css";
import { DisablePrint } from "@/components/disable-print";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Grupo Studio Portal",
    template: "%s | Grupo Studio",
  },
  description: "Portal centralizado de dashboards e relatórios de inteligência da Grupo Studio.",
  robots: { index: false, follow: false }, // Portal interno — não indexar
  openGraph: {
    title: "Grupo Studio Portal",
    description: "Portal de Dashboards e Relatórios — Grupo Studio",
    siteName: "Grupo Studio Portal",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${cinzel.variable} ${montserrat.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
            <DisablePrint />
          </ThemeProvider>
      </body>
    </html>
  );
}
