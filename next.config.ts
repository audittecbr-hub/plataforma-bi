import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

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

/*
 * Codec Pro no build de produção. A fonte é comercial e o repositório é público,
 * então os .ttf ficam no bucket privado "brand-assets" do Supabase do portal: os
 * que faltarem em public/fonts/codec-pro são baixados com as credenciais que o
 * deploy já tem e conferidos pelo SHA-256 — a Vercel publica exatamente os mesmos
 * arquivos usados localmente, e o layout os ativa sozinho.
 *
 * Na produção da Vercel, qualquer falha interrompe o build (a versão no ar continua
 * a anterior) em vez de publicar o portal com a fonte de fallback; em preview e na
 * máquina local, só avisa e segue com a Hanken Grotesk.
 * Para trocar a fonte, suba os novos arquivos no bucket e atualize os hashes.
 */
const CODEC_PRO_BUCKET_PATH = "brand-assets/fonts/codec-pro";
const CODEC_PRO_DIR = path.join(process.cwd(), "public", "fonts", "codec-pro");
const CODEC_PRO_SHA256: Record<string, string> = {
  "CodecPro-Regular.ttf": "1d7dda52666f9ca621477f2af74df0f2fac834e7c0cb4f1d8ee4b9b0c9e55810",
  "CodecPro-News.ttf": "179ae7af084fd9fe559bd2ea510ec81d743dc5fc28dceef8b578e850665ddfef",
  "CodecPro-Bold.ttf": "8c21f367ba99be9a29dab87bc2097e348ef053afe144f9516800106efc09608b",
  "CodecPro-ExtraBold.ttf": "09663b8723506871ba90d7732fea66f456e6f28893b8d2111096939445b8431d",
};

async function ensureCodecPro() {
  const missing = Object.keys(CODEC_PRO_SHA256).filter(
    (file) => !existsSync(path.join(CODEC_PRO_DIR, file))
  );
  if (missing.length === 0) return;

  const strict = process.env.VERCEL_ENV === "production";
  const fail = (reason: string) => {
    if (strict) {
      throw new Error(`[codec-pro] ${reason} Build interrompido para não publicar o portal sem a fonte oficial.`);
    }
    console.warn(`[codec-pro] ${reason} Seguindo com a Hanken Grotesk.`);
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) {
    return fail("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.");
  }

  // Chaves legadas (JWT) vão também no Authorization; as novas (sb_secret_...) só no apikey.
  const headers: Record<string, string> = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  // Baixa e confere tudo antes de gravar: a pasta nunca fica com metade das variações.
  const downloads: [string, Buffer][] = [];
  for (const file of missing) {
    let data: Buffer;
    try {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/${CODEC_PRO_BUCKET_PATH}/${file}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return fail(`Download de ${file} falhou (HTTP ${res.status}).`);
      data = Buffer.from(await res.arrayBuffer());
    } catch (error) {
      return fail(`Download de ${file} falhou (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (createHash("sha256").update(data).digest("hex") !== CODEC_PRO_SHA256[file]) {
      return fail(`${file} baixado não confere com o SHA-256 esperado.`);
    }
    downloads.push([file, data]);
  }

  mkdirSync(CODEC_PRO_DIR, { recursive: true });
  for (const [file, data] of downloads) writeFileSync(path.join(CODEC_PRO_DIR, file), data);
  console.log(`[codec-pro] ${downloads.length} arquivo(s) baixado(s) do Supabase.`);
}

export default async function config(phase: string): Promise<NextConfig> {
  if (phase === PHASE_PRODUCTION_BUILD) await ensureCodecPro();
  return nextConfig;
}
