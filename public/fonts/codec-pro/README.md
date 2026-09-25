# Codec Pro (fonte oficial do Grupo Studio)

A Codec Pro (Zetafonts) é a tipografia oficial do Design System do Grupo Studio.
Ela é **comercial** e este repositório é **público**, então os arquivos da
fonte **não são versionados** (veja o `.gitignore`).

Para ativá-la, coloque os arquivos licenciados nesta pasta:

- `CodecPro-Regular.ttf` (400)
- `CodecPro-News.ttf` (500)
- `CodecPro-Bold.ttf` (700)
- `CodecPro-ExtraBold.ttf` (800)

O `src/app/layout.tsx` detecta os arquivos presentes e declara o `@font-face`
sozinho. Sem eles, o portal usa a **Hanken Grotesk**, o fallback oficial do DS,
servida pelo `next/font`.

No deploy, eles vêm do bucket privado `brand-assets` do Supabase do portal
(pasta `fonts/codec-pro/`): o `next.config.ts` baixa os que faltarem durante o
`next build` e confere o SHA-256 de cada um. Na produção da Vercel, se a fonte
não puder ser baixada, o build falha e a versão no ar continua a anterior.
Nunca faça commit deles.
