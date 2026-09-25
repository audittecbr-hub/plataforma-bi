/** Variáveis aceitas nos templates de mensagem das automações. */
export const TEMPLATE_VARIABLES = [
  { token: '{nome}', description: 'Primeiro nome do destinatário (ex.: João)' },
  { token: '{nome_completo}', description: 'Nome completo do destinatário' },
  { token: '{saudacao}', description: '"Bom dia", "Boa tarde" ou "Boa noite" (automático)' },
  { token: '{data}', description: 'Data de referência do relatório ou dia atual' },
  { token: '{data_semanal}', description: 'Período da semana anterior (ex.: 15/01/2026 a 21/01/2026)' },
  { token: '{grupo}', description: 'Nome do departamento ou grupo (ex.: Diretoria)' },
] as const

/** Quebra o texto em trechos e variáveis `{...}` para destacar na prévia. */
export function splitTemplate(content: string) {
  return content.split(/(\{[a-z_]+\})/g).filter(Boolean)
}
