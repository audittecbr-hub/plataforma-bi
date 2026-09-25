import { Gem, MapPinned, Target, TrendingUp, Wallet, Workflow, type LucideIcon } from "lucide-react"
import { DEPARTMENT_GROUPS } from "@/lib/constants"

/**
 * Ícone e rótulo de cada grupo de departamentos. A paleta do Design System é
 * travada, então as áreas se distinguem pelo ícone — nunca por cores novas.
 */
export const GROUP_META: Record<string, { icon: LucideIcon; label: string }> = {
  Diretoria: { icon: Gem, label: "Visão Geral" },
  GS: { icon: Gem, label: "Visão Geral" },
  Financeiro: { icon: Wallet, label: "Financeiro" },
  Comercial: { icon: TrendingUp, label: "Comercial" },
  Operacional: { icon: Workflow, label: "Operacional" },
  "Metas Líderes": { icon: Target, label: "Metas Líderes" },
  Regionais: { icon: MapPinned, label: "Regionais" },
}

/** Grupo principal de um (sub)departamento — "Expansão" → "Comercial". */
export function departmentGroup(department?: string | null) {
  if (!department) return undefined
  return DEPARTMENT_GROUPS[department] ?? department
}

/**
 * Departamentos de envio dos contatos de automação: a chave é o valor gravado
 * no banco (minúsculo, sem acento), o rótulo é o que aparece na interface.
 */
export const CONTACT_DEPARTMENTS: { value: string; label: string }[] = [
  { value: "geral", label: "Diretoria" },
  { value: "expansao", label: "Expansão" },
  { value: "franchising", label: "Franchising" },
  { value: "educacao", label: "Educação" },
  { value: "tax", label: "Tax" },
  { value: "corporate", label: "Corporate" },
  { value: "tecnologia", label: "Tecnologia" },
  { value: "financeiro", label: "Financeiro" },
]

export function contactDepartmentLabel(value: string | null) {
  if (!value) return null
  const found = CONTACT_DEPARTMENTS.find((d) => d.value === value.toLowerCase())
  if (found) return found.label
  return value.charAt(0).toUpperCase() + value.slice(1)
}
