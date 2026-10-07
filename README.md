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

### Navegação de relatórios

O portal abre com a saudação e uma tela de boas-vindas. Ao escolher um relatório,
o cabeçalho passa a mostrar seu nome, área, subárea, tipo e posição na lista.
Links diretos abrem o relatório correspondente, sem passar pela saudação.

Áreas, subáreas e relatórios ficam no menu lateral em cascata. Clique na área,
abra a subárea e escolha o relatório; áreas sem subdivisões mostram os
relatórios diretamente. A busca no menu aceita nomes de áreas, subáreas e
projetos, inclusive sem acentos. `Ctrl+K` também encontra os relatórios.
No celular, a mesma cascata está no botão de menu e fecha ao escolher um painel.
Configurações e Administração ficam no menu da conta, aberto pelo nome ou avatar
no rodapé. A opção de Administração aparece apenas para administradores.

O caminho selecionado é salvo na URL (`area`, `subarea`, `report`), permitindo
compartilhar links e usar voltar/avançar. A hierarquia é montada no servidor com
as permissões existentes; links para IDs indisponíveis voltam a um relatório
autorizado. Valide esses comportamentos com `npm test`.

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
| `PORTAL_AI_REGISTRATION_SECRET` | Autenticação dos scripts PBIP em `/api/bi-ai/register` |
| `OPENCODE_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` | Chave do provedor selecionado em `gs_config_ia`, somente no servidor |
| `BI_AI_ENCRYPTION_KEY` | Chave mestra Base64 de 32 bytes para salvar chaves de provedores cifradas pela aba Administração → IA |
| `BI_AI_ENABLED` | Fallback opcional antes da migration; `true` ativa o Chat apenas quando não há configuração salva no banco |
| `BI_AI_PROVIDER`, `BI_AI_MODEL`, `BI_AI_BASE_URL`, `BI_AI_API_KEY` | Configuração opcional de endpoint compatível; `gs_config_ia` tem precedência sobre a escolha por ambiente |

## Chat IA contextual

O Chat IA usa `currentDashboard.id` do visualizador, revalida a sessão e a mesma
regra de permissão da página no servidor, lê o manifesto vinculado ao registro
`dashboards` e executa DAX no modelo semântico do Power BI. Veja
[a arquitetura, contrato e passos de instalação](docs/bi-ai.md).
Administradores configuram provedores, chaves, modelos, raciocínio e ativação
por dashboard na aba **IA** do painel administrativo.

**Publish to web é público no lado Power BI. O login do Supabase protege o
Portal e o Chat, mas não transforma a URL Publish to web em conteúdo privado.**

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
