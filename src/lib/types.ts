export interface Dashboard {
  id: string
  name: string
  url: string
  department: string
  allowed_departments?: string[] | null
  assigned_user_id?: string | null
  sub_group?: string | null
}
