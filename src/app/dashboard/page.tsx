import { DashboardPageContent } from '@/components/dashboard-page-content'
import { getDashboardData } from '@/lib/dashboard-data'
import { firstName } from '@/lib/user-display'

export const metadata = { title: 'Dashboards' }
export const dynamic = 'force-dynamic'
const TIMEZONE = 'America/Sao_Paulo'

function saudacao(agora: Date) {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: TIMEZONE }).format(agora))
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dataPorExtenso(agora: Date) {
  const texto = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIMEZONE }).format(agora)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default async function DashboardPage() {
  const { user, profile, permissionContext } = await getDashboardData()
  const agora = new Date()
  return (
    <DashboardPageContent welcome={{
      greeting: saudacao(agora),
      name: firstName({ fullName: profile?.full_name, email: user.email }),
      date: dataPorExtenso(agora),
      eyebrow: permissionContext.isDiretoria ? 'Visão consolidada · Diretoria' : `Departamento · ${permissionContext.department}`,
    }} />
  )
}
