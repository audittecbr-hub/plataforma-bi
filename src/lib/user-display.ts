export type PortalUser = {
  email?: string | null
  fullName?: string | null
  department?: string | null
  isAdmin: boolean
  isLeader?: boolean
}

/** Papel legível do usuário — "Administrador", "Líder · Tax", "Financeiro"... */
export function describeRole(user: PortalUser) {
  if (user.isAdmin) return "Administrador"
  if (user.isLeader) return user.department ? `Líder · ${user.department}` : "Líder"
  return user.department || "Colaborador"
}

/** Nome para exibição; sem `full_name`, deriva do e-mail ("ana.souza@" → "Ana Souza"). */
export function displayName(user: Pick<PortalUser, "fullName" | "email">) {
  if (user.fullName?.trim()) return user.fullName.trim()
  const local = user.email?.split("@")[0] ?? "Usuário"
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

export function firstName(user: Pick<PortalUser, "fullName" | "email">) {
  return displayName(user).split(" ")[0]
}
