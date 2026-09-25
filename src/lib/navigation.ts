import {
  Activity,
  CalendarClock,
  LayoutDashboard,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  adminOnly?: boolean
}

/** Destinos principais — sidebar, menu mobile e paleta de comandos. */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboards",
    description: "Relatórios e metas do seu departamento",
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard/settings",
    label: "Configurações",
    description: "Aparência, conta e segurança",
    icon: Settings2,
  },
  {
    href: "/dashboard/admin",
    label: "Administração",
    description: "Usuários, dashboards e automações",
    icon: ShieldCheck,
    adminOnly: true,
  },
]

export type AdminSection = { tab: string; label: string; description: string; icon: LucideIcon }

/** Abas do painel administrativo — a chave `tab` vai na querystring. */
export const ADMIN_SECTIONS: AdminSection[] = [
  { tab: "users", label: "Usuários", description: "Contas, departamentos e permissões", icon: Users },
  { tab: "dashboards", label: "Dashboards", description: "Relatórios, visibilidade e atualizações", icon: LayoutDashboard },
  { tab: "automation", label: "Automação", description: "Agendamentos e contatos de envio", icon: CalendarClock },
  { tab: "templates", label: "Templates", description: "Mensagens usadas nas automações", icon: MessageSquareText },
  { tab: "accessLogs", label: "Acessos", description: "Auditoria de entradas no portal", icon: Activity },
]

export function isNavActive(pathname: string, href: string) {
  return pathname === href
}
