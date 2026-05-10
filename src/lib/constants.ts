export const MAIN_DEPARTMENTS = [
  'Diretoria',
  'Financeiro',
  'Comercial',
  'Operacional',
  'Metas Líderes',
] as const

export const DEPARTMENT_LABELS: Record<string, string> = {
  'Diretoria': 'Diretoria (permissão total)',
  'Financeiro': 'Financeiro',
  'Comercial': 'Comercial (expansão, franchising, educação)',
  'Operacional': 'Operacional (TAX, Corporate, tecnologia)',
  'Metas Líderes': 'Metas Líderes (Individuais)',
}

// Maps sub-departments to their main group
export const DEPARTMENT_GROUPS: Record<string, typeof MAIN_DEPARTMENTS[number]> = {
  'Diretoria': 'Diretoria',
  'Financeiro': 'Financeiro',
  'Comercial': 'Comercial',
  'Expansão': 'Comercial',
  'Franchising': 'Comercial',
  'Educação': 'Comercial',
  'Operacional': 'Operacional',
  'Tax': 'Operacional',
  'Corporate': 'Operacional',
  'Tecnologia': 'Operacional',
  'DHO': 'Metas Líderes',
  'Metas Líderes': 'Metas Líderes',
}

// Used for Admin User Dialog - specific sub-departments
export const SELECTABLE_DEPARTMENTS = [
  'Diretoria',
  'Financeiro',
  'Expansão',
  'Franchising',
  'Educação',
  'Tax',
  'Corporate',
  'Tecnologia',
  'DHO'
] as const

// Original list for backward compatibility in Select options if needed, 
// though we prefer using the groupings now.
export const SUB_DEPARTMENTS = [
  'Diretoria',
  'Financeiro',
  'Comercial',
  'Expansão',
  'Franchising',
  'Educação',
  'Operacional',
  'Tax',
  'Corporate',
  'Tecnologia',
  'DHO',
  'Metas Líderes',
]

export const DEPARTMENT_SUB_MENUS: Record<string, string[]> = {
  'Comercial': ['Expansão', 'Franchising', 'Educação'],
  'Operacional': ['Tax', 'Corporate', 'Tecnologia'],
  'Metas Líderes': ['Corporate', 'Expansão', 'Franchising', 'Tax', 'Tecnologia', 'DHO']
}
