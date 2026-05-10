import type { NextConfig } from "next";

const securityHeaders = [
  // Impede browsers de fazerem MIME-sniffing do content-type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Bloqueia carregamento em iframes de outros domínios (clickjacking)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Controla quais informações de referência são enviadas
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desabilita acesso a APIs sensíveis não utilizadas
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

const nextConfig: NextConfig = {
  // Remove o header "X-Powered-By: Next.js" das respostas HTTP
  poweredByHeader: false,

  // Habilita compressão gzip/brotli das respostas (reduz payload ~70% para JSON/HTML)
  compress: true,

  // Otimiza tree-shaking de pacotes com muitos exports.
  // lucide-react exporta ~1000 ícones; @radix-ui/* exporta muitos primitivos.
  // O bundler passa a importar apenas o que é realmente usado, reduzindo o bundle.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tabs",
      "@radix-ui/react-select",
      "@radix-ui/react-popover",
      "@radix-ui/react-alert-dialog",
    ],
  },

  // Headers de segurança + cache para assets imutáveis
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Assets gerados pelo Next.js são imutáveis (hash no nome) — cache de 1 ano
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
