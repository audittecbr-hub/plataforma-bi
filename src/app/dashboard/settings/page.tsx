import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { DepartmentChip } from "@/components/ui/department-chip"
import { PageHeader } from "@/components/ui/page-header"
import { AppearanceSettings } from "@/components/settings/appearance-settings"
import { ChangePasswordForm } from "@/components/settings/change-password-form"
import { SettingsSection } from "@/components/settings/settings-section"
import { displayName } from "@/lib/user-display"

export const metadata = { title: "Configurações" }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, department, is_admin, is_leader, allowed_sub_departments")
    .eq("id", user.id)
    .single()

  const nome = displayName({ fullName: profile?.full_name, email: user.email })
  const extras: string[] = profile?.allowed_sub_departments ?? []

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageHeader
        eyebrow="Preferências"
        title="Configurações"
        description="Sua conta, a aparência do portal e a segurança do seu acesso."
      />

      <div className="flex flex-col gap-8">
        <SettingsSection title="Perfil" description="Dados da sua conta. Para alterá-los, fale com o administrador do portal.">
          <div className="relative flex flex-col gap-5 overflow-hidden rounded-xl border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
            <span aria-hidden className="absolute left-6 top-0 h-[3px] w-10 bg-gold" />
            <Avatar name={profile?.full_name} email={user.email} size={64} brand />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="truncate text-xl font-bold tracking-[-0.01em] text-foreground">{nome}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <DepartmentChip department={profile?.department} />
                {extras.length > 0 && (
                  <span className="text-xs text-muted-foreground" title={extras.join(", ")}>
                    +{extras.length} {extras.length === 1 ? "área" : "áreas"} com acesso
                  </span>
                )}
                {profile?.is_admin && <Badge variant="solid">Admin</Badge>}
                {profile?.is_leader && <Badge variant="gold">Líder</Badge>}
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Aparência" description="Escolha o tema do portal. A preferência fica salva neste navegador.">
          <AppearanceSettings />
        </SettingsSection>

        <SettingsSection title="Segurança" description="Troque sua senha de acesso. Você precisará da senha atual para confirmar.">
          <ChangePasswordForm />
        </SettingsSection>
      </div>
    </div>
  )
}
