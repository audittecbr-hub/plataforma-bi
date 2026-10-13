'use client'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeChatMarkdown, SOURCE_SECTION } from '@/lib/bi-ai/message-format'

function MessageMarkdown({ text }: { text: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} skipHtml
    allowedElements={['p', 'ul', 'ol', 'li', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'code', 'pre', 'br', 'hr']}
    unwrapDisallowed components={{
      p: ({ children }) => <p className="my-3 whitespace-pre-line leading-7 first:mt-0 last:mb-0">{children}</p>,
      h1: ({ children }) => <h3 className="mb-3 mt-6 text-base font-semibold first:mt-0">{children}</h3>,
      h2: ({ children }) => <h3 className="mb-3 mt-6 text-base font-semibold first:mt-0">{children}</h3>,
      h3: ({ children }) => <h3 className="mb-3 mt-6 font-semibold text-gold-text first:mt-0">{children}</h3>,
      h4: ({ children }) => <h4 className="mb-2 mt-5 font-semibold">{children}</h4>,
      ul: ({ children }) => <ul className="my-3 list-disc space-y-3 pl-5 marker:text-gold-text">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal space-y-3 pl-5 marker:text-gold-text">{children}</ol>,
      li: ({ children }) => <li className="pl-1 leading-7 [&>p]:my-1">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      blockquote: ({ children }) => <blockquote className="my-4 rounded-lg border-l-2 border-gold bg-gold-wash px-3 py-2 text-sm [&>p]:my-0">{children}</blockquote>,
      table: ({ children }) => <div className="my-4 w-full min-w-0 max-w-full overflow-x-auto rounded-lg border" role="region" aria-label="Tabela de resultados" tabIndex={0}><table className="w-full border-collapse text-xs">{children}</table></div>,
      th: ({ children }) => <th className="border-b bg-accent px-3 py-2 text-left font-semibold">{children}</th>,
      td: ({ children }) => <td className="border-b px-3 py-2 align-top last:border-b-0">{children}</td>,
      pre: ({ children }) => <pre className="my-4 min-w-0 max-w-full overflow-x-auto rounded-lg bg-accent p-3 text-xs">{children}</pre>,
      code: ({ children }) => <code className="break-words rounded bg-accent px-1 py-0.5 text-xs">{children}</code>,
    }}>{text}</Markdown>
}

export function BiAiResponse({ answer }: { answer: string }) {
  const formatted = normalizeChatMarkdown(answer)
  const split = formatted.indexOf(SOURCE_SECTION)
  const main = split < 0 ? formatted : formatted.slice(0, split).trim()
  const source = split < 0 ? '' : formatted.slice(split + SOURCE_SECTION.length).trim()
  const sections = main.split(/^### (?:📂|Registros:) /m)
  return <div className="w-full min-w-0 max-w-full break-words text-sm text-foreground [overflow-wrap:anywhere]">
    <MessageMarkdown text={sections[0]} />
    {sections.slice(1).map((section, index) => {
      const newline = section.indexOf('\n')
      const title = newline < 0 ? section : section.slice(0, newline)
      const body = newline < 0 ? '' : section.slice(newline).trim()
      const count = /^\*\*(\d+) registro\(s\) encontrado\(s\)\.\*\*/.exec(body)
      return <details key={index} open={index === 0} className="my-4 min-w-0 max-w-full rounded-lg border bg-background p-3">
        <summary className="cursor-pointer select-none font-semibold text-gold-text">{title}{count && <span className="ml-2 text-xs font-normal text-muted-foreground">· {count[1]} {count[1] === '1' ? 'registro' : 'registros'}</span>}</summary>
        <div className="mt-3 min-w-0"><MessageMarkdown text={count ? body.slice(count[0].length).trim() : body} /></div>
      </details>
    })}
    {source && <details className="mt-5 border-t pt-3 text-muted-foreground">
      <summary className="cursor-pointer select-none text-xs font-medium hover:text-foreground">Ver fonte, filtros e cuidados com a leitura</summary>
      <div className="mt-3 text-xs"><MessageMarkdown text={source} /></div>
    </details>}
  </div>
}
