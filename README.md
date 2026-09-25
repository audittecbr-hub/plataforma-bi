# Portal BI — Grupo Studio

Portal interno de inteligência do Grupo Studio: dashboards do Power BI por
departamento, metas de líderes, automações de envio de relatórios e auditoria
de acessos.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Radix UI ·
Supabase (auth e dados) · Power BI "Publicar na Web".

## Rodando localmente

```bash
npm ci
npm run dev
```

Abra <http://localhost:3000>. Antes de subir, rode `npm run lint` e `npm run build`.

### Variáveis de ambiente

Crie um `.env.local` (não versionado) com:

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (sessão do usuário) |
| `SUPABASE_SERVICE_ROLE_KEY` | Operações administrativas no servidor e download da Codec Pro no build |
| `POWERBI_TENANT`, `POWERBI_CLIENT_ID`, `POWERBI_CLIENT_SECRET`, `POWERBI_WORKSPACE_ID` | Status e refresh dos datasets do Power BI |
| `NEXT_PUBLIC_SITE_URL` | Links de e-mail e logo nos templates de e-mail |
| `NEXUS_WEBHOOK_SECRET`, `NEXT_PUBLIC_CORE_API_URL` | Integrações da automação |
| `RESEND_API_KEY` | Envio de e-mails (hoje em modo simulado) |

## Design System

O visual segue o **Design System oficial do Grupo Studio** (pilares:
profissionalismo, credibilidade e sofisticação).

- **Tokens** em `src/app/globals.css`: paleta travada de cinco tons (preto
  `#1f1f1f`, dourado escuro `#927245`, dourado claro `#d5ae77`, cinza claro
  `#ebebeb`, branco) mais as variações funcionais do DS; temas claro (branco /
  cinza) e escuro (preto premium); raios de 4px (botões e campos) e 8px
  (cards); sombras neutras; movimento com `cubic-bezier(0.22, 1, 0.36, 1)`,
  sem mola. Sem gradientes e sem texturas além do grid hairline.
- **Ilhas de tema:** a classe `dark` num container força o tema escuro só ali
  (a sidebar é sempre preta); `light` força o claro (o formulário do login).
- **Marca** em `public/brand`: logos oficiais V1 (horizontal, grafite e
  branco), V2 (vertical, branco) e o selo GS recortado da V1. Use sempre o
  componente `src/components/brand/logo.tsx` — o DS proíbe recompor o logo em
  texto ou aplicar efeitos.
- **Componentes base** em `src/components/ui` (botão, campos, diálogos,
  tabelas, painel, cabeçalho de página, estados vazios, tooltips).

### Fonte Codec Pro

A tipografia oficial é a **Codec Pro** (Zetafonts), que é comercial. Como este
repositório é público, os arquivos da fonte **não são versionados**. Para
ativá-la, coloque os `.ttf` licenciados em `public/fonts/codec-pro/` (veja o
README da pasta) — o layout os detecta sozinho. Sem eles, o portal usa a
**Hanken Grotesk**, o fallback oficial do DS, servida pelo `next/font`.

No deploy, os arquivos vêm do bucket privado `brand-assets` do Supabase do
portal (pasta `fonts/codec-pro/`): durante o `next build`, o `next.config.ts`
baixa os que faltarem com as credenciais do Supabase que o deploy já tem e
confere o SHA-256 de cada um. Na produção da Vercel, se a fonte não puder ser
baixada, o build falha e a versão no ar continua a anterior. Para trocar a
fonte, suba os novos arquivos no bucket e atualize os hashes no
`next.config.ts`. Nunca faça commit dos `.ttf`.

## Estrutura

```
src/
  app/                  rotas (login, auth, dashboard, admin, settings)
  components/
    brand/              logos oficiais
    ui/                 componentes base do design system
    admin/              painel administrativo
    auth/               moldura das telas de autenticação
    settings/           seções de configurações
  lib/                  constantes, navegação, Power BI, e-mail
  utils/supabase/       clientes Supabase (browser, servidor, admin)
```
