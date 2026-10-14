'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionWithRole } from '@/lib/auth'
import { isFullAccess } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { EmployeeInsert, UserRole } from '@/types/database'
import { siteUrl } from '@/lib/site-url'

// ── Quick-edit a single field on an employee row ───────────────────────────
const ALLOWED_QUICK_FIELDS = new Set(['role', 'department', 'status', 'work_regime', 'start_date'])

export async function quickUpdateEmployee(
  id: string,
  field: string,
  value: string
): Promise<{ error?: string }> {
  if (!(await getSessionWithRole(['management']))) return { error: 'Sem permissão.' }
  if (!ALLOWED_QUICK_FIELDS.has(field)) return { error: 'Campo não permitido.' }

  const supabase = createAdminClient()
  const payload: Record<string, string | null> = {
    [field]: value.trim() || null,
  }

  const { error } = await supabase.from('employees').update(payload).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/colaboradores')
  return {}
}

const POSITION_LABELS: Record<string, string> = {
  management:          'Management',
  director:            'Diretor',
  employee:            'Colaborador',
  professional_intern: 'Estágio Profissional',
  curricular_intern:   'Estágio Curricular',
}

export async function createEmployee(_: unknown, formData: FormData) {
  const session = await getSessionWithRole(['management'])
  if (!session) return { error: 'Sem permissão.' }

  // Acesso total só o dá quem já o tem — senão a gestão podia criar contas
  // acima de si e entrar por elas
  const appRole = formData.get('app_role') as UserRole
  if (isFullAccess(appRole) && !isFullAccess(session.app_role)) {
    return { error: 'Só um master pode criar contas master ou admin.' }
  }

  const supabase = createAdminClient()

  const workRegime = formData.get('work_regime') as 'full_time' | 'part_time'
  const daysPerWeek = formData.get('days_per_week')
  const positionType = (formData.get('position_type') as string) || 'employee'

  const employee: EmployeeInsert = {
    first_name:   formData.get('first_name') as string,
    last_name:    formData.get('last_name') as string,
    // Vazio a null — o índice único no email faz o "" colidir entre
    // colaboradores sem email preenchido
    email:        ((formData.get('email') as string) ?? '').trim() || null,
    phone:        (formData.get('phone') as string) || null,
    role:         POSITION_LABELS[positionType] ?? positionType,
    department:   formData.get('department') as string,
    position_type: positionType as 'director' | 'employee' | 'professional_intern' | 'curricular_intern' | 'management',
    app_role:     appRole,
    status:       formData.get('status') as 'active' | 'inactive' | 'on_leave',
    work_regime:  workRegime,
    days_per_week: workRegime === 'part_time' && daysPerWeek ? Number(daysPerWeek) : null,
    start_date:   formData.get('start_date') as string,
    end_date:     (formData.get('end_date') as string) || null,
    notes:        (formData.get('notes') as string) || null,
    auth_user_id: null,
  }

  const { data: empRow, error } = await supabase
    .from('employees')
    .insert(employee)
    .select('id')
    .single()

  if (error) return { error: `Erro ao guardar: ${error.message}` }

  // Enviar convite por email para o colaborador definir a sua password.
  // Sem email não há convite a enviar — o colaborador fica criado na mesma.
  if (employee.email) {
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      employee.email,
      { redirectTo: `${await siteUrl()}/auth/callback?next=/auth/set-password` }
    )

    if (!inviteError && inviteData?.user?.id) {
      await supabase
        .from('employees')
        .update({ auth_user_id: inviteData.user.id })
        .eq('id', empRow.id)
    }
  }
  // Nota: se o convite falhar, o colaborador foi criado na mesma.
  // O admin pode reenviar o convite na ficha do colaborador.

  redirect('/colaboradores')
}
